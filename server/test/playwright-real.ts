/**
 * Playwright 真实问答端到端 — 全栈真实 LLM（DeepSeek + 智谱）。
 *
 * 模拟真实用户完整旅程：
 *   1. 注册 → 进入主界面
 *   2. 写笔记（石墨烯知识）→ 自动摄入
 *   3. 轮询知识库列表直到文档 ready
 *   4. 回到对话 → 提问「石墨烯的电子迁移率」
 *   5. 等待 DeepSeek 回答（含工具调用）
 *   6. 验证：答案非空、含引用、工具调用展示
 *
 * 前置：API :8787 + 前端 :5173 已起，.env 配好真实 key。
 */
import { chromium } from "playwright";

const WEB = "http://localhost:5173";
const TS = Date.now();
const EMAIL = `real_${TS}@e2e.test`;
const PASS = "testpass12345";
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
  console.log("\n🎭 Playwright 真实问答端到端（DeepSeek v4-pro + 智谱）\n");
  const browser = await chromium.launch({ headless: true, executablePath: CHROME_EXEC });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  page.setDefaultTimeout(20000);

  try {
    // 【1】注册
    console.log("【1】注册");
    await page.goto(WEB, { waitUntil: "domcontentloaded" });
    await sleep(1500);
    const tabs = page.locator(".auth-tab");
    if (await tabs.count() >= 2) await tabs.nth(1).click();
    await sleep(300);
    await page.fill('input[placeholder="you@example.com"]', EMAIL);
    await page.fill('input[type="password"]', PASS);
    await page.locator(".auth-card button.btn").last().click();
    await sleep(2000);
    ok("注册进入主界面", (await page.locator(".sidebar").count()) > 0);

    // 【2】写笔记
    console.log("\n【2】写笔记（石墨烯知识）");
    await page.locator(".nav-item", { hasText: "写笔记" }).click();
    await sleep(500);
    await page.fill('input[placeholder="笔记标题"]', "石墨烯研究笔记");
    await page.fill("textarea",
      "# 石墨烯\n\n石墨烯是由碳原子以二维蜂窝晶格排列构成的单层材料，2004 年由 Geim 和 Novoselov 首次分离，获 2010 年诺贝尔物理学奖。\n\n石墨烯的电子迁移率约为 200000 cm²/V·s，是硅的 100 倍以上。在狄拉克点呈线性色散关系，电子如同无质量狄拉克费米子。");
    await page.locator("button", { hasText: "保存并摄入" }).click();
    await sleep(1500);
    ok("笔记保存成功", (await page.locator("text=已保存").count()) > 0);

    // 【3】轮询知识库直到 ready
    console.log("\n【3】等待摄入完成");
    let ready = false;
    for (let i = 0; i < 20; i++) {
      await page.locator(".nav-item", { hasText: "知识库" }).click();
      await sleep(1200);
      const badge = await page.locator(".badge.ready").count();
      const title = await page.locator("text=石墨烯研究笔记").count();
      if (badge > 0 && title > 0) { ready = true; break; }
      await sleep(1500);
    }
    ok("文档摄入完成（ready）", ready, ready ? "" : "超时未就绪");
    if (!ready) { await page.screenshot({ path: "test/pw-real-debug.png" }); }

    // 【4】回到对话提问
    console.log("\n【4】提问「石墨烯的电子迁移率」");
    await page.locator(".nav-item", { hasText: "对话" }).first().click();
    await sleep(500);
    const ta = page.locator(".composer textarea");
    await ta.fill("石墨烯的电子迁移率大约是多少？请基于知识库回答。");
    await page.locator(".send-btn").click();

    // 【5】等待回答（DeepSeek reasoning 模型较慢，最多等 90s）
    console.log("\n【5】等待 DeepSeek 回答…");
    let answerText = "";
    for (let i = 0; i < 45; i++) {
      await sleep(2000);
      const bubbles = await page.locator(".msg.assistant .bubble").count();
      if (bubbles >= 1) {
        const t = await page.locator(".msg.assistant .bubble").last().textContent();
        if (t && t.length > 30 && !t.includes("思考中")) { answerText = t; break; }
      }
    }
    console.log("   [回答预览]", (answerText || "(空)").slice(0, 180));
    ok("收到非空回答", answerText.length > 30, `len=${answerText.length}`);

    // 【6】验证引用与工具调用展示
    console.log("\n【6】验证引用 + 工具调用");
    ok("答案含迁移率数值", /200000|200,000/.test(answerText), answerText.slice(0, 100));
    const citations = await page.locator(".citations .cite-chip").count();
    ok("展示引用来源", citations > 0, `cite count=${citations}`);
    const toolTrace = await page.locator(".tool-call-row").count();
    ok("展示工具调用追踪", toolTrace > 0, `tool rows=${toolTrace}`);

  } catch (e) {
    failures.push("异常: " + (e as Error).message);
    console.error("异常:", e);
    await page.screenshot({ path: "test/pw-real-fail.png" }).catch(() => {});
  } finally {
    await browser.close();
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`✅ 通过 ${passed} 项`);
  if (failures.length) { console.log(`❌ 失败 ${failures.length} 项:`); failures.forEach((f) => console.log(`   - ${f}`)); }
  else console.log("🎉 全部通过！");
  console.log("=".repeat(50));
  process.exit(failures.length ? 1 : 0);
}
main();
