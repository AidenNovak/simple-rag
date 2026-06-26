import { test, expect, type Page } from "@playwright/test";

/**
 * YouMind 工作区验收 E2E（V/O/B/D）。
 * 前置：npm run dev + npm run dev:worker + npm run web:dev 已启动。
 * 每用例注册唯一账号，避免数据串扰。
 */
const BASE = process.env.E2E_BASE || "http://localhost:5173";
const PASSWORD = process.env.TEST_PASSWORD || "testtest123";
const API = process.env.E2E_API || "http://127.0.0.1:8787";

function newEmail() {
  const base = process.env.TEST_EMAIL || "e2e-workspace@test.local";
  const [name, domain] = base.includes("@") ? base.split("@") : ["e2e-workspace", "test.local"];
  return `${name}-${Date.now()}-${Math.floor(Math.random() * 9999)}@${domain}`;
}

async function registerAndLogin(page: Page): Promise<string> {
  const email = newEmail();
  await page.goto(BASE);
  await page.getByRole("button", { name: "注册", exact: true }).click();
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(PASSWORD);
  await page.getByRole("button", { name: "创建账号" }).click();
  await expect(page.getByRole("banner")).toBeVisible({ timeout: 20000 });
  // token 挂到 page 上供后续 API 调用复用（避免重复登录）
  const token = await page.evaluate(() => localStorage.getItem("kb_token") || "");
  (page as any).__token = token;
  return token;
}

async function desktop(page: Page) {
  await page.setViewportSize({ width: 1400, height: 900 });
}

/** 通过 API 直接创建一篇笔记并等摄入就绪，返回 { id, token }。 */
async function createReadyNote(token: string, title: string, content: string): Promise<string> {
  const r = await fetch(`${API}/api/documents/note`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title, content }),
  }).then((x) => x.json());
  const id = r.document.id;
  // 轮询直到 ready
  for (let i = 0; i < 30; i++) {
    const d = await fetch(`${API}/api/documents/${id}`, { headers: { Authorization: `Bearer ${token}` } }).then((x) => x.json());
    if (d.document?.status === "ready") break;
    await new Promise((res) => setTimeout(res, 2000));
  }
  return id;
}

test.describe("kb workspace acceptance", () => {
  let token = "";
  test.beforeEach(async ({ page }) => {
    token = await registerAndLogin(page);
  });

  test("V2/O1-O3: three columns visible on desktop", async ({ page }) => {
    await desktop(page);
    await expect(page.getByTestId("file-tree")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("editor-pane")).toBeVisible();
    await expect(page.getByTestId("chat-pane")).toBeVisible();
    await expect(page.getByRole("banner")).toHaveText(/私人知识库/);
  });

  test("V1: no legacy main nav tabs (.nav-item count = 0)", async ({ page }) => {
    await desktop(page);
    await expect(page.locator(".nav-item")).toHaveCount(0);
  });

  test("B1+B2: create note, edit, persist after reload", async ({ page }) => {
    await desktop(page);
    const stamp = `e2e-${Date.now()}`;
    await page.getByRole("button", { name: /新建笔记/ }).first().click();
    await expect(page.getByPlaceholder("笔记标题")).toBeVisible({ timeout: 10000 });
    await page.getByPlaceholder("笔记标题").fill(`E2E ${stamp}`);
    const body = page.locator('textarea[aria-label="正文"]');
    await body.fill(`unique-e2e-content-${stamp}`);
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/documents/") && r.request().method() === "PATCH", { timeout: 15000 }),
      page.getByRole("button", { name: "保存" }).click(),
    ]);
    await page.waitForTimeout(2000);
    await page.reload();
    const row = page.locator('[data-testid="tree-row"]', { hasText: `E2E ${stamp}` }).first();
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.click();
    await expect(body).toHaveValue(new RegExp(stamp));
  });

  test("V3: saved note is searchable via /api/search within ≤90s", async ({ page }) => {
    await desktop(page);
    const needle = `searchable-needle-${Date.now()}`;
    const noteId = await createReadyNote(token, `V3 ${needle}`, `正文含 ${needle} 用于检索验证`);
    expect(noteId).toBeTruthy();
    // 刷新让 FileTree 加到该笔记
    await page.reload();
    const row = page.locator('[data-testid="tree-row"]', { hasText: `V3 ${needle}` }).first();
    await expect(row).toBeVisible({ timeout: 15000 });
    // 通过 API 验证可检索（≤90s 已在 createReadyNote 轮询中保证）
    const r = await fetch(`${API}/api/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: needle, topK: 5 }),
    }).then((x) => x.json());
    const hit = (r.results || []).some((x: any) => (x.text || "").includes(needle) || (x.docTitle || "").includes(needle));
    expect(hit).toBeTruthy();
  });

  test("B7: doc_patch SSE renders patch-bar (accept)", async ({ page, request }) => {
    await desktop(page);
    const noteId = await createReadyNote(token, "B7 Patch Target", "# 标题\n\n第一节：原始内容");
    // 刷新让 FileTree 加到该笔记，再打开
    await page.reload();
    const row = page.locator('[data-testid="tree-row"]', { hasText: "B7 Patch Target" }).first();
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.click();
    // 拦截 chat/stream，返回合成的 doc_patch SSE
    await page.route("**/api/chat/stream", async (route) => {
      const before = "# 标题\n\n第一节：原始内容";
      const after = "# 标题\n\n第一节：\n- 要点一\n- 要点二";
      const sse = [
        `event: doc_patch\ndata: ${JSON.stringify({ type: "doc_patch", docId: noteId, content: after, previousContent: before })}\n\n`,
        `event: done\ndata: ${JSON.stringify({ conversationId: "mock", usage: null, followUps: [] })}\n\n`,
      ].join("");
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: sse });
    });
    // 发送一条消息触发 stream
    await page.getByPlaceholder(/发送消息/).fill("改一下");
    await page.locator(".send-btn").last().click();
    // patch-bar 应出现
    await expect(page.getByTestId("patch-bar")).toBeVisible({ timeout: 10000 });
    // 点「采纳」→ 编辑器内容更新为 after
    await page.getByRole("button", { name: "采纳" }).click();
    await expect(page.locator('textarea[aria-label="正文"]')).toHaveValue(/要点一/);
  });
});
