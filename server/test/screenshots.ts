/**
 * 截图脚本：注册用户 → 写笔记 → 上传 → 问答 → 截取每个页面。
 * 用于 Landing Page 真实截图。
 */
import { chromium } from "playwright";
import path from "node:path";

const WEB = "http://localhost:5173";
const CHROME_EXEC =
  "/Users/lijixiang/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const OUT = path.resolve("screenshots");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME_EXEC });
  const page = await (await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  })).newPage();
  page.setDefaultTimeout(15000);

  // 注册
  await page.goto(WEB, { waitUntil: "domcontentloaded" }); await sleep(1500);
  await page.locator(".auth-tab").nth(1).click(); await sleep(300);
  await page.fill('input[placeholder="you@example.com"]', `demo@screenshot.test`);
  await page.fill('input[type="password"]', "screenshot12345");
  await page.locator(".auth-card button.btn").last().click();
  await sleep(2000);

  // 【1】空状态首页
  await page.screenshot({ path: path.join(OUT, "01-chat-empty.png") });
  console.log("✅ 01-chat-empty");

  // 【2】写笔记
  await page.locator(".nav-item", { hasText: "写笔记" }).click(); await sleep(600);
  await page.fill('input[placeholder="笔记标题"]', "量子计算入门");
  await page.fill("textarea",
    `# 量子计算入门\n\n量子比特（qubit）是量子计算的基本单位。与经典比特只能表示 0 或 1 不同，量子比特可以处于叠加态。\n\n## 关键概念\n\n- **叠加态**：一个量子比特可以同时处于 0 和 1 的状态\n- **量子纠缠**：两个量子比特可以建立关联，无论相距多远\n- **量子干涉**：通过干涉效应增强正确答案的概率\n\n## 重要算法\n\n1. **Shor 算法**：可在多项式时间内分解大整数，威胁 RSA 加密\n2. **Grover 算法**：无结构搜索的平方加速\n3. **VQE**：变分量子本征求解器，用于化学模拟\n\n## 数学表示\n\n态矢量：$|\\psi\\rangle = \\alpha|0\\rangle + \\beta|1\\rangle$\n\n其中 $|\\alpha|^2 + |\\beta|^2 = 1$。`);
  await page.screenshot({ path: path.join(OUT, "02-notes-editing.png") });
  console.log("✅ 02-notes-editing");

  // 保存
  await page.locator("button", { hasText: "保存并摄入" }).click(); await sleep(2000);

  // 再写一篇
  await page.fill('input[placeholder="笔记标题"]', "深度学习基础");
  await page.fill("textarea", "# 深度学习\n\n卷积神经网络（CNN）擅长处理图像。Transformer 架构基于自注意力机制，是 GPT/BERT 的核心。\n\n反向传播通过链式法则计算梯度。Adam 优化器结合了动量与自适应学习率。");
  await page.locator("button", { hasText: "保存并摄入" }).click(); await sleep(2000);

  // 【3】知识库页
  await page.locator(".nav-item", { hasText: "知识库" }).click(); await sleep(800);
  // 等摄入
  for (let i = 0; i < 20; i++) {
    if (await page.locator(".badge.ready").count() >= 2) break;
    await sleep(2000);
  }
  await sleep(1000);
  await page.screenshot({ path: path.join(OUT, "03-documents.png") });
  console.log("✅ 03-documents");

  // 【4】问答
  await page.locator(".nav-item", { hasText: "对话" }).first().click(); await sleep(500);
  await page.locator(".composer textarea").fill("什么是量子叠加态？它和经典比特有什么区别？");
  await page.locator(".send-btn").click();
  // 等回答
  for (let i = 0; i < 50; i++) {
    await sleep(2000);
    const t = await page.locator(".msg.assistant .bubble").last().textContent();
    if (t && t.length > 50 && !t.includes("思考")) break;
  }
  await sleep(2000);
  await page.screenshot({ path: path.join(OUT, "04-chat-answer.png") });
  console.log("✅ 04-chat-answer");

  // 【5】检索页
  await page.locator(".nav-item", { hasText: "检索" }).click(); await sleep(500);
  await page.locator('input[placeholder*="关键词"]').fill("Transformer");
  await page.locator(".card button", { hasText: "检索" }).click();
  await sleep(2000);
  await page.screenshot({ path: path.join(OUT, "05-search.png") });
  console.log("✅ 05-search");

  // 【6】设置页
  await page.locator(".nav-item", { hasText: "设置" }).click(); await sleep(500);
  await page.screenshot({ path: path.join(OUT, "06-settings.png") });
  console.log("✅ 06-settings");

  // 【7】认证页（新开无痕）
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page2 = await ctx2.newPage();
  await page2.goto(WEB, { waitUntil: "domcontentloaded" }); await sleep(1500);
  await page2.screenshot({ path: path.join(OUT, "07-auth.png") });
  console.log("✅ 07-auth");

  await browser.close();
  console.log("\n所有截图已保存到 screenshots/");
}

main().catch((e) => { console.error("截图异常:", e); process.exit(1); });
