/**
 * 前端文件上传 Playwright 测试。
 *
 * 模拟真实用户：注册 → 知识库页 → 点上传 → 选文件 → 等就绪 → 对话问答。
 * 用 Playwright 的 setInputFiles 上传真实生成的文件。
 */
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

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

async function genTestFiles(dir: string) {
  // PDF
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([600, 400]);
  page.drawText("Neural Network Basics: A neural network learns by adjusting weights via backpropagation. The sigmoid activation function maps inputs to 0-1 range. ReLU is preferred in deep networks to avoid vanishing gradients.", { x: 50, y: 350, size: 11, font, lineHeight: 16 });
  await fs.writeFile(path.join(dir, "neural.pdf"), await pdf.save());
  // TXT
  await fs.writeFile(path.join(dir, "optics.txt"),
    "光学基础：光的折射遵循斯涅尔定律 n1*sin(θ1)=n2*sin(θ2)。全反射发生在光从光密介质射向光疏介质且入射角大于临界角时。光纤通信利用全反射原理传输信号。");
  return [path.join(dir, "neural.pdf"), path.join(dir, "optics.txt")];
}

async function main() {
  console.log("\n📤 前端文件上传 Playwright 测试\n");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kb-ui-upload-"));
  const testFiles = await genTestFiles(tmp);

  const browser = await chromium.launch({ headless: true, executablePath: CHROME_EXEC });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  page.setDefaultTimeout(15000);

  try {
    // 注册
    console.log("【1】注册");
    await page.goto(WEB, { waitUntil: "domcontentloaded" }); await sleep(1500);
    const tabs = page.locator(".auth-tab");
    if (await tabs.count() >= 2) await tabs.nth(1).click(); await sleep(300);
    await page.fill('input[placeholder="you@example.com"]', `uiupload_${Date.now()}@test.com`);
    await page.fill('input[type="password"]', "uiupload12345");
    await page.locator(".auth-card button.btn").last().click(); await sleep(2000);
    ok("注册进入主界面", (await page.locator(".sidebar").count()) > 0);

    // 上传文件
    console.log("\n【2】通过 UI 上传 2 个文件");
    await page.locator(".nav-item", { hasText: "知识库" }).click(); await sleep(800);
    // 找到隐藏的 file input（dropzone 点击会动态创建 input）
    // 方案：直接监听 filechooser 事件
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator(".dropzone").click(),
    ]);
    await (fileChooser as any).setFiles(testFiles);
    await sleep(2000);

    // 等待摄入完成
    console.log("\n【3】等待文件摄入就绪");
    let ready = 0;
    for (let i = 0; i < 40; i++) {
      ready = await page.locator(".badge.ready").count();
      if (ready >= 2) break;
      await sleep(2000);
    }
    ok("2 个文件通过 UI 上传并就绪", ready >= 2, `ready=${ready}`);

    // 验证文件出现在列表
    const neuralVisible = await page.locator("text=neural.pdf").count();
    const opticsVisible = await page.locator("text=optics.txt").count();
    ok("PDF 文件在列表中", neuralVisible > 0);
    ok("TXT 文件在列表中", opticsVisible > 0);

    // 对话问答
    console.log("\n【4】基于上传文件问答");
    await page.locator(".nav-item", { hasText: "对话" }).first().click(); await sleep(500);
    await page.locator(".composer textarea").fill("什么是全反射？发生在什么条件下？");
    await page.locator(".send-btn").click();
    let ans = "";
    for (let i = 0; i < 50; i++) {
      await sleep(2000);
      const t = await page.locator(".msg.assistant .bubble").last().textContent();
      if (t && t.length > 30 && !t.includes("思考")) { ans = t; break; }
    }
    ok("问答返回答案", ans.length > 30, `len=${ans.length}`);
    ok("答案涉及全反射/光密介质", /全反射|光密|光疏|临界角/.test(ans), ans.slice(0, 80));
    const hasCite = await page.locator(".cite-chip").count();
    ok("展示引用来源", hasCite > 0, `cite=${hasCite}`);

    // 验证 toast
    console.log("\n【5】Toast 通知");
    // 上传时应该出现过 toast（可能已消失），验证 toast 容器存在
    const toastContainer = await page.locator(".toast-container").count();
    ok("Toast 容器存在", toastContainer > 0);

  } catch (e) {
    failures.push("异常: " + (e as Error).message);
    console.error("异常:", (e as Error).message);
    await page.screenshot({ path: "test/upload-ui-fail.png" }).catch(() => {});
  } finally {
    await browser.close();
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`✅ 通过 ${passed} 项`);
  if (failures.length) { console.log(`❌ 失败 ${failures.length}:`); failures.forEach((f) => console.log(`   - ${f}`)); }
  else console.log("🎉 全部通过！");
  console.log("=".repeat(50));
  process.exit(failures.length ? 1 : 0);
}
main();
