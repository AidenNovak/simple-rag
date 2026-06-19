/**
 * Playwright 前端端到端测试 — 模拟真实用户点击与页面跳转。
 *
 * 覆盖流程：
 *   1. 注册新用户（中文界面）
 *   2. 登录后进入对话页（验证侧栏 + 空状态）
 *   3. 跳转「知识库」→ 创建笔记
 *   4. 跳转「写笔记」→ 写入内容
 *   5. 跳转「检索」→ 验证界面
 *   6. 跳转「设置」→ 绑定 Key
 *   7. 侧栏导航切换验证
 *
 * 前置：API 在 :8787、前端在 :5173 已起。
 * 运行：npx tsx test/playwright.ts
 *
 * 注：真实问答需 NewAPI key；无 key 时只验证 UI 流程 + API 非 LLM 部分。
 */
import { chromium } from "playwright";

const API = "http://127.0.0.1:8787";
const WEB = "http://localhost:5173";
const TS = Date.now();
const EMAIL = `tester_${TS}@e2e.test`;
const PASS = "testpass12345";

let passed = 0;
const failures: string[] = [];
function ok(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ""}`); console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CHROME_EXEC =
  "/Users/lijixiang/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

async function main() {
  console.log("\n🎭 Playwright 前端端到端测试\n");
  // 用已安装的完整 Chromium（headless shell 下载受阻，直接指定 executablePath）
  const browser = await chromium.launch({ headless: true, executablePath: CHROME_EXEC });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const reqs: string[] = [];
  page.on("request", (r) => reqs.push(`${r.method()} ${r.url()}`));

  try {
    // 【1】注册
    console.log("【1】注册流程");
    await page.goto(WEB, { waitUntil: "domcontentloaded" });
    await sleep(1500); // 等 React 挂载 + Vite 编译
    // 默认是登录态，先切到注册 tab（auth-tabs 内的第二个 tab）
    const authTabs = page.locator(".auth-tab");
    const tabCount = await authTabs.count();
    if (tabCount >= 2) await authTabs.nth(1).click(); // 点「注册」
    await sleep(300);
    await page.fill('input[placeholder="you@example.com"]', EMAIL);
    await page.fill('input[type="password"]', PASS);
    await sleep(200);
    // 点「创建账号」按钮
    const submitBtn = page.locator(".auth-card button.btn").last();
    await submitBtn.click();
    await sleep(2000); // 等注册请求 + 跳转
    await page.screenshot({ path: "test/pw-after-register.png" }).catch(() => {});
    const hasSidebar = await page.locator(".sidebar").count();
    ok("注册后进入主界面（侧栏出现）", hasSidebar > 0, `sidebar count=${hasSidebar}`);
    ok("界面为中文（含「新对话」）", (await page.locator("text=新对话").count()) > 0);

    // 【2】对话页空状态
    console.log("\n【2】对话页空状态");
    const emptyText = await page.locator("text=向你的知识库提问").count();
    ok("对话空状态文案", emptyText > 0);
    const composer = await page.locator(".composer textarea").count();
    ok("输入框存在", composer > 0);

    // 【3】跳转知识库
    console.log("\n【3】导航 — 知识库");
    await page.locator(".nav-item", { hasText: "知识库" }).click();
    await sleep(500);
    ok("进入知识库页（含上传区）", (await page.locator(".dropzone").count()) > 0);
    ok("知识库页有标题", (await page.locator("h1", { hasText: "知识库" }).count()) > 0);

    // 【4】跳转写笔记
    console.log("\n【4】导航 — 写笔记");
    await page.locator(".nav-item", { hasText: "写笔记" }).click();
    await sleep(500);
    ok("进入笔记页（含标题输入）", (await page.locator('input[placeholder="笔记标题"]').count()) > 0);
    // 写入笔记
    await page.fill('input[placeholder="笔记标题"]', "Playwright 测试笔记");
    await page.fill("textarea", "# 测试\n\n这是 Playwright 自动写入的笔记，用于验证端到端流程。包含关键词：石墨烯、拓扑绝缘体。");
    await page.locator("button", { hasText: "保存并摄入" }).click();
    await sleep(1000);
    ok("笔记保存提示出现", (await page.locator("text=已保存").count()) > 0);

    // 【5】回到知识库验证笔记出现
    console.log("\n【5】知识库列表含新笔记");
    await page.locator(".nav-item", { hasText: "知识库" }).click();
    await sleep(800);
    // 笔记可能还在摄入中，验证标题出现
    const noteVisible = await page.locator("text=Playwright 测试笔记").count();
    ok("知识库列表含刚创建的笔记", noteVisible > 0, "笔记未出现在列表");

    // 【6】跳转检索
    console.log("\n【6】导航 — 检索");
    await page.locator(".nav-item", { hasText: "检索" }).click();
    await sleep(500);
    ok("进入检索页", (await page.locator("h1", { hasText: "检索" }).count()) > 0);
    ok("检索框存在", (await page.locator('input[placeholder*="关键词"]').count()) > 0);

    // 【7】跳转设置
    console.log("\n【7】导航 — 设置");
    await page.locator(".nav-item", { hasText: "设置" }).click();
    await sleep(500);
    ok("进入设置页", (await page.locator("h1", { hasText: "设置" }).count()) > 0);
    ok("NewAPI Key 绑定区存在", (await page.locator("text=NewAPI Key").count()) > 0);
    ok("显示当前邮箱", (await page.locator(`text=${EMAIL}`).count()) > 0);

    // 【8】回到对话
    console.log("\n【8】导航 — 回到对话");
    await page.locator(".nav-item", { hasText: "对话" }).first().click();
    await sleep(500);
    ok("回到对话页", (await page.locator(".composer").count()) > 0);

    // 【9】侧栏会话列表（笔记保存不产生会话，新对话应可点）
    console.log("\n【9】新对话按钮");
    await page.locator("button", { hasText: "新对话" }).click();
    await sleep(400);
    ok("新对话可点击", (await page.locator("text=向你的知识库提问").count()) > 0);

    // 【10】验证 API 调用发生了
    console.log("\n【10】API 交互验证");
    ok("发生了 /api/auth 请求", reqs.some((r) => r.includes("/api/auth")));
    ok("发生了 /api/documents 请求", reqs.some((r) => r.includes("/api/documents")));

    // 【11】API 级验证：me 接口
    console.log("\n【11】API 鉴权验证");
    const token = await page.evaluate(() => localStorage.getItem("kb_token"));
    ok("前端存了 token", !!token);
    const meRes = await fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    const meData = await meRes.json();
    ok("/api/auth/me 返回用户", meData.user?.email === EMAIL, meData.user?.email);

  } catch (e) {
    failures.push("测试异常: " + (e as Error).message);
    console.error("异常:", e);
    // 截图存证
    await page.screenshot({ path: "test/playwright-fail.png" }).catch(() => {});
  } finally {
    await browser.close();
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`✅ 通过 ${passed} 项`);
  if (failures.length) {
    console.log(`❌ 失败 ${failures.length} 项：`);
    failures.forEach((f) => console.log(`   - ${f}`));
  } else {
    console.log("🎉 全部通过！");
  }
  console.log("=".repeat(50));
  process.exit(failures.length > 0 ? 1 : 0);
}

main();
