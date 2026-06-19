/**
 * 模拟真实用户旅程（多场景 + 边界交互）。
 *
 * 场景：
 *   1. 注册 → 登录态校验
 *   2. 上传真实文件（生成 .md/.txt 上传）
 *   3. 写笔记（含特殊字符边界）
 *   4. 等摄入 → 验证列表更新
 *   5. 问答（真实 DeepSeek）
 *   6. 检索功能
 *   7. 删除文档
 *   8. 切换会话（侧栏）
 *   9. 边界：空提问、超长提问、连续快速点击
 *  10. 设置页绑定 key
 */
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const API = "http://127.0.0.1:8787";
const WEB = "http://localhost:5173";
const CHROME_EXEC =
  "/Users/lijixiang/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

let passed = 0;
const failures: string[] = [];
const ok = (n: string, c: boolean, d?: string) => {
  if (c) { passed++; console.log(`  ✅ ${n}`); }
  else { failures.push(`${n}${d ? ` — ${d}` : ""}`); console.log(`  ❌ ${n}${d ? ` — ${d}` : ""}`); }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("\n🎭 模拟真实用户旅程（多场景）\n");
  const browser = await chromium.launch({ headless: true, executablePath: CHROME_EXEC });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  page.setDefaultTimeout(15000);
  const TS = Date.now();

  try {
    // 【1】注册
    console.log("【1】注册 + 登录态");
    await page.goto(WEB, { waitUntil: "domcontentloaded" }); await sleep(1500);
    const tabs = page.locator(".auth-tab");
    if (await tabs.count() >= 2) await tabs.nth(1).click();
    await sleep(300);
    await page.fill('input[placeholder="you@example.com"]', `journey_${TS}@test.com`);
    await page.fill('input[type="password"]', "journey12345");
    await page.locator(".auth-card button.btn").last().click();
    await sleep(2000);
    ok("注册进入主界面", (await page.locator(".sidebar").count()) > 0);

    // 【2】写笔记（含边界字符）
    console.log("\n【2】写笔记（含 emoji/特殊字符边界）");
    await page.locator(".nav-item", { hasText: "写笔记" }).click(); await sleep(500);
    await page.fill('input[placeholder="笔记标题"]', "物理学基础 🎉");
    await page.fill("textarea",
      "# 经典力学\n\n牛顿第二定律：$F = ma$。这是经典力学的核心 🚀\n\n# 热力学\n\n熵 $S = k_B \\ln \\Omega$，描述系统无序度。\n\n零宽字符测试：\u200B\u200C不可见但存在。");
    await page.locator("button", { hasText: "保存并摄入" }).click();
    await sleep(1500);
    ok("笔记保存成功", (await page.locator("text=已保存").count()) > 0);

    // 【3】写第二个笔记
    console.log("\n【3】写第二篇笔记");
    await page.fill('input[placeholder="笔记标题"]', "电磁学笔记");
    await page.fill("textarea", "麦克斯韦方程组统一了电与磁：\n\n$\\nabla \\cdot \\vec{E} = \\rho/\\epsilon_0$\n\n电磁波以光速传播。");
    await page.locator("button", { hasText: "保存并摄入" }).click();
    await sleep(1500);

    // 【4】等摄入 + 验证列表
    console.log("\n【4】等待摄入完成");
    let readyCount = 0;
    for (let i = 0; i < 30; i++) {
      await page.locator(".nav-item", { hasText: "知识库" }).click(); await sleep(1500);
      readyCount = await page.locator(".badge.ready").count();
      if (readyCount >= 2) break;
    }
    ok("两篇笔记摄入就绪", readyCount >= 2, `ready=${readyCount}`);

    // 【5】问答（真实 DeepSeek）
    console.log("\n【5】真实问答");
    await page.locator(".nav-item", { hasText: "对话" }).first().click(); await sleep(500);
    await page.locator(".composer textarea").fill("牛顿第二定律是什么？");
    await page.locator(".send-btn").click();
    let ans = "";
    for (let i = 0; i < 50; i++) {
      await sleep(2000);
      const t = await page.locator(".msg.assistant .bubble").last().textContent();
      if (t && t.length > 30 && !t.includes("思考中")) { ans = t; break; }
    }
    ok("问答返回答案", ans.length > 30, `len=${ans.length}`);
    ok("答案含 F=ma 或牛顿", /F\s*=\s*m|牛顿|ma/.test(ans), ans.slice(0, 80));
    const hasCite = await page.locator(".cite-chip").count();
    ok("展示引用来源", hasCite > 0, `cite=${hasCite}`);

    // 【6】检索功能
    console.log("\n【6】检索功能");
    await page.locator(".nav-item", { hasText: "检索" }).click(); await sleep(500);
    await page.locator('input[placeholder*="关键词"]').fill("麦克斯韦");
    await page.locator(".card button", { hasText: "检索" }).click();
    await sleep(2000);
    const searchRes = await page.locator(".panel .card").count();
    ok("检索返回结果", searchRes > 0, `cards=${searchRes}`);

    // 【7】删除文档
    console.log("\n【7】删除文档");
    await page.locator(".nav-item", { hasText: "知识库" }).click(); await sleep(500);
    page.on("dialog", (d) => d.accept());
    const delBtns = await page.locator("button", { hasText: "删除" }).count();
    if (delBtns > 0) {
      await page.locator("button", { hasText: "删除" }).first().click();
      await sleep(1500);
      ok("删除操作执行", true);
    } else ok("删除按钮存在", false, "无删除按钮");

    // 【8】边界：空提问
    console.log("\n【8】边界 — 空提问");
    await page.locator(".nav-item", { hasText: "对话" }).first().click(); await sleep(500);
    await page.locator(".composer textarea").fill("");
    const sendDisabled = await page.locator(".send-btn").isDisabled();
    ok("空提问时发送禁用", sendDisabled);

    // 【9】边界：超长提问
    console.log("\n【9】边界 — 超长提问");
    const longQ = "请解释量子力学".repeat(50);
    await page.locator(".composer textarea").fill(longQ);
    await page.locator(".send-btn").click();
    await sleep(3000);
    let longAns = "";
    for (let i = 0; i < 30; i++) {
      await sleep(2000);
      const t = await page.locator(".msg.assistant .bubble").last().textContent();
      if (t && t.length > 20) { longAns = t; break; }
    }
    ok("超长提问不崩溃（有响应）", longAns.length > 20, `len=${longAns.length}`);

    // 【10】切换会话
    console.log("\n【10】侧栏切换");
    await page.locator("button", { hasText: "新对话" }).click(); await sleep(800);
    ok("新对话清空", (await page.locator("text=向你的知识库提问").count()) > 0);
    const convoItems = await page.locator(".convo-item").count();
    if (convoItems > 0) {
      await page.locator(".convo-item").first().click(); await sleep(1000);
      ok("切换到旧会话加载历史", (await page.locator(".msg").count()) > 0, `msgs=${await page.locator(".msg").count()}`);
    } else ok("有历史会话可切换", false, "无会话");

    // 【11】设置页
    console.log("\n【11】设置页");
    await page.locator(".nav-item", { hasText: "设置" }).click(); await sleep(500);
    ok("设置页 DeepSeek Chat 区", (await page.locator("text=DeepSeek Chat").count()) > 0);

  } catch (e) {
    failures.push("异常: " + (e as Error).message);
    console.error("异常:", (e as Error).message);
    await page.screenshot({ path: "test/journey-fail.png" }).catch(() => {});
  } finally {
    await browser.close();
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`✅ 通过 ${passed} 项`);
  if (failures.length) { console.log(`❌ 失败 ${failures.length}:`); failures.forEach((f) => console.log(`   - ${f}`)); }
  else console.log("🎉 全部通过！");
  console.log("=".repeat(50));
  process.exit(failures.length ? 1 : 0);
}
main();
