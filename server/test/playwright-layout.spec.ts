import { test, expect } from "@playwright/test";

/**
 * 工作区布局完整性几何 + 视觉回归（LV1/LV2/LB1）。
 * 前置：npm run dev + npm run dev:worker + npm run web:dev 已启动。
 */
const PASSWORD = process.env.TEST_PASSWORD || "testtest123";
function newEmail() {
  const base = process.env.TEST_EMAIL || "e2e-layout@test.local";
  const [name, domain] = base.includes("@") ? base.split("@") : ["e2e-layout", "test.local"];
  return `${name}-${Date.now()}-${Math.floor(Math.random() * 9999)}@${domain}`;
}

async function login(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(() => { localStorage.removeItem("kb_token"); sessionStorage.clear(); });
  await page.reload();
  await page.getByPlaceholder("you@example.com").waitFor({ state: "visible", timeout: 15000 });
  await page.getByRole("button", { name: "注册", exact: true }).click();
  await page.getByPlaceholder("you@example.com").fill(newEmail());
  await page.getByPlaceholder("••••••••").fill(PASSWORD);
  await page.getByRole("button", { name: "创建账号" }).click();
  await expect(page.getByRole("banner")).toBeVisible({ timeout: 20000 });
}

test.describe("layout integrity", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await login(page);
  });

  test("LV1: panes ordered left-center-right", async ({ page }) => {
    const boxes = await page.evaluate(() => {
      const q = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      return {
        left: q('[data-pane="left"]'),
        center: q('[data-pane="center"]'),
        right: q('[data-pane="right"]'),
      };
    });
    expect(boxes.left.right).toBeLessThanOrEqual(boxes.center.left + 6);
    expect(boxes.center.right).toBeLessThanOrEqual(boxes.right.left + 6);
    expect(boxes.left.width).toBeGreaterThan(100);
    expect(boxes.center.width).toBeGreaterThan(200);
    expect(boxes.right.width).toBeGreaterThan(200);
  });

  test("LV2: composer contained in right pane", async ({ page }) => {
    const ok = await page.evaluate(() => {
      const chat = document.querySelector('[data-pane="right"]')!;
      const composer = document.querySelector("[data-testid=composer-stack]")!;
      const p = chat.getBoundingClientRect();
      const c = composer.getBoundingClientRect();
      return c.left >= p.left - 1 && c.right <= p.right + 1 && c.bottom <= p.bottom + 1;
    });
    expect(ok).toBe(true);
  });

  test("LB1: resize left resizer preserves order", async ({ page }) => {
    const resizer = page.locator(".workspace-resizer-left");
    const box = await resizer.boundingBox();
    if (!box) throw new Error("no resizer");
    await page.mouse.move(box.x + 2, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + 80, box.y + 200);
    await page.mouse.up();
    const ordered = await page.evaluate(() => {
      const L = document.querySelector('[data-pane="left"]')!.getBoundingClientRect();
      const C = document.querySelector('[data-pane="center"]')!.getBoundingClientRect();
      const R = document.querySelector('[data-pane="right"]')!.getBoundingClientRect();
      return L.right <= C.left + 6 && C.right <= R.left + 6;
    });
    expect(ordered).toBe(true);
  });

  test("visual baseline: workspace desktop", async ({ page }) => {
    await page.getByRole("button", { name: /新建笔记/ }).first().click();
    await page.getByPlaceholder("笔记标题").fill("Layout Snapshot");
    await expect(page.locator(".workspace-root")).toHaveScreenshot("workspace-1400x900.png", {
      maxDiffPixelRatio: 0.02,
    });
  });
});
