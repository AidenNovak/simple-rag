/**
 * 多格式文件上传端到端测试。
 *
 * 覆盖核心场景：
 *   1. 生成真实二进制文件：PDF / Word(.docx) / PPT(.pptx) / XLSX / Markdown / TXT
 *   2. 批量上传（多个文件同时上传）
 *   3. 异步摄入：轮询直到每个文件 ready
 *   4. 跨格式问答：针对每种格式的文件内容提问，验证 DeepSeek 能正确召回
 *
 * 前置：API :8787 + worker 已起，.env 配好真实 key。
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const API = "http://127.0.0.1:8787";
let passed = 0;
const failures: string[] = [];
const ok = (n: string, c: boolean, d?: string) => {
  if (c) { passed++; console.log(`  ✅ ${n}`); }
  else { failures.push(`${n}${d ? ` — ${d}` : ""}`); console.log(`  ❌ ${n}${d ? ` — ${d}` : ""}`); }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- 文件生成器 ----
async function genFiles(dir: string) {
  console.log("【1】生成真实多格式文件");
  const files: { name: string; content: string; fmt: string; docId?: string }[] = [];

  // PDF (pdf-lib)
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle("量子计算基础");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([600, 400]);
  page.drawText("Quantum Computing Fundamentals\n\nQubits are the basic unit of quantum information. Unlike classical bits, a qubit can be in a superposition of 0 and 1 simultaneously. Quantum entanglement allows qubits to be correlated in ways impossible classically. Shor's algorithm can factor integers in polynomial time, threatening RSA encryption. Grover's algorithm provides quadratic speedup for unstructured search.", { x: 50, y: 350, size: 11, font, lineHeight: 16 });
  await fs.writeFile(path.join(dir, "quantum.pdf"), await pdf.save());
  files.push({ name: "quantum.pdf", content: "superposition qubit Shor Grover entanglement RSA", fmt: "pdf" });

  // Word (.docx)
  const { Document, Packer, Paragraph, TextRun } = await import("docx");
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ children: [new TextRun({ text: "深度学习技术综述", bold: true, size: 32 })] }),
        new Paragraph({ children: [new TextRun({ text: "" })] }),
        new Paragraph({ children: [new TextRun({ text: "卷积神经网络(CNN)是处理图像的核心架构。Transformer架构由Google在2017年提出，彻底改变了自然语言处理领域。注意力机制允许模型关注输入序列的不同部分。" })] }),
        new Paragraph({ children: [new TextRun({ text: "反向传播算法用于训练神经网络，通过链式法则计算梯度。梯度消失问题困扰深层网络训练，残差连接(ResNet)有效缓解了这一问题。" })] }),
      ],
    }],
  });
  await fs.writeFile(path.join(dir, "deeplearning.docx"), await Packer.toBuffer(doc));
  files.push({ name: "deeplearning.docx", content: "卷积神经网络 Transformer 注意力机制 反向传播 梯度消失 残差连接", fmt: "docx" });

  // PPT (.pptx)
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  const slide1 = pptx.addSlide();
  slide1.addText("热力学四大定律", { x: 0.5, y: 0.5, fontSize: 28, bold: true });
  slide1.addText("第零定律：热平衡的传递性。如果A与B热平衡，B与C热平衡，则A与C热平衡。", { x: 0.5, y: 1.5, fontSize: 16 });
  const slide2 = pptx.addSlide();
  slide2.addText("熵增原理", { x: 0.5, y: 0.5, fontSize: 28, bold: true });
  slide2.addText("第二定律：孤立系统的熵不减。克劳修斯表述：热量不能自发从低温传到高温。", { x: 0.5, y: 1.5, fontSize: 16 });
  await pptx.writeFile({ fileName: path.join(dir, "thermodynamics.pptx") });
  files.push({ name: "thermodynamics.pptx", content: "热力学 第零定律 熵增 克劳修斯 热平衡", fmt: "pptx" });

  // XLSX
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["元素", "原子序数", "电子构型", "发现年份"],
    ["氢", 1, "1s1", 1766],
    ["氦", 2, "1s2", 1868],
    ["锂", 3, "[He]2s1", 1817],
    ["碳", 6, "[He]2s2 2p2", "古代已知"],
    ["氧", 8, "[He]2s2 2p4", 1774],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "元素周期表");
  await XLSX.writeFile(wb, path.join(dir, "elements.xlsx"));
  files.push({ name: "elements.xlsx", content: "氢 氦 锂 碳 氧 原子序数 电子构型 元素周期表", fmt: "xlsx" });

  // Markdown
  await fs.writeFile(path.join(dir, "bio.md"),
    `# 生物信息学\n\n生物信息学结合生物学与计算机科学。DNA序列由ATCG四种碱基组成。\n\nBLAST算法用于序列比对，是生物信息学的基石工具。\n\n蛋白质折叠预测：AlphaFold2利用深度学习解决困扰生物学50年的难题。`);
  files.push({ name: "bio.md", content: "生物信息学 DNA BLAST 蛋白质折叠 AlphaFold", fmt: "md" });

  // TXT
  await fs.writeFile(path.join(dir, "history.txt"),
    "天体物理学简史\n\n哈勃定律：星系的退行速度与距离成正比，v=H0*d，证明宇宙在膨胀。\n\n宇宙微波背景辐射(CMB)是大爆炸理论的关键证据，温度约2.7K。\n\n暗物质占宇宙总质能的约27%，不发光但通过引力效应被探测。");
  files.push({ name: "history.txt", content: "哈勃定律 宇宙膨胀 微波背景辐射 暗物质 大爆炸", fmt: "txt" });

  for (const f of files) console.log(`  生成 ${f.name} (${f.fmt})`);
  ok("生成 6 种格式文件", files.length === 6);
  return files;
}

// ---- 上传 ----
async function uploadFile(token: string, filePath: string, filename: string): Promise<{ docId?: string; err?: string }> {
  try {
    const buf = await fs.readFile(filePath);
    const blob = new Blob([buf]);
    const fd = new FormData();
    fd.append("file", blob, filename);
    const res = await fetch(`${API}/api/documents/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const j: any = await res.json();
    return res.ok ? { docId: j.document?.id } : { err: j.error };
  } catch (e) { return { err: (e as Error).message }; }
}

async function waitForReady(token: string, docId: string, timeoutMs = 120000): Promise<{ status: string; errorMsg?: string }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await fetch(`${API}/api/documents`, { headers: { Authorization: `Bearer ${token}` } });
    const j: any = await r.json();
    const doc = (j.documents || []).find((d: any) => d.id === docId);
    if (doc?.status === "ready") return { status: "ready" };
    if (doc?.status === "failed") return { status: "failed", errorMsg: doc.errorMsg };
    await sleep(2000);
  }
  return { status: "timeout" };
}

async function ask(token: string, q: string): Promise<{ answer?: string; err?: string }> {
  try {
    const res = await fetch(`${API}/api/chat/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ question: q }),
    });
    const j: any = await res.json();
    return res.ok ? { answer: j.answer } : { err: j.error };
  } catch (e) { return { err: (e as Error).message }; }
}

async function main() {
  console.log("\n📁 多格式文件上传端到端测试\n");

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kb-upload-"));

  // 【1】生成文件
  const files = await genFiles(tmp);

  // 【2】注册用户
  console.log("\n【2】注册用户");
  const TS = Date.now();
  const regRes: any = await (await fetch(`${API}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `upload_${TS}@test.com`, password: "upload12345" }),
  })).json();
  const token = regRes.token;
  ok("用户注册成功", !!token);

  // 【3】批量上传（并发上传所有文件）
  console.log("\n【3】并发批量上传 6 个文件");
  const uploadStart = Date.now();
  const uploadResults = await Promise.all(
    files.map((f) => uploadFile(token, path.join(tmp, f.name), f.name))
  );
  const uploaded = uploadResults.filter((r) => r.docId);
  ok("6 个文件全部上传成功", uploaded.length === 6, `成功 ${uploaded.length}/6`);
  files.forEach((f, i) => {
    if (uploadResults[i].docId) f.docId = uploadResults[i].docId!;
  });

  // 【4】异步摄入：轮询等待全部 ready
  console.log("\n【4】异步摄入（worker 串行处理 6 个文件）");
  const ingestPromises = files.map(async (f) => {
    const result = await waitForReady(token, f.docId!, 180000);
    return { file: f, ...result };
  });
  const ingestResults = await Promise.all(ingestPromises);
  const readyCount = ingestResults.filter((r) => r.status === "ready").length;
  ok(`全部 ${files.length} 文件摄入就绪`, readyCount === files.length, `ready ${readyCount}/${files.length}`);
  ingestResults.forEach((r) => {
    if (r.status !== "ready") console.log(`    ⚠ ${r.file.name}: ${r.status}${r.errorMsg ? " — " + r.errorMsg : ""}`);
  });
  console.log(`    摄入总耗时: ${Date.now() - uploadStart}ms`);

  // 【5】跨格式问答
  console.log("\n【5】跨格式问答（验证每种格式内容可检索）");
  const questions = [
    { q: "Shor算法能做什么？", expect: /Shor|RSA|分解|factor/i, file: "quantum.pdf" },
    { q: "Transformer架构是谁提出的？解决什么问题？", expect: /Google|2017|自然语言|NLP/i, file: "deeplearning.docx" },
    { q: "热力学第二定律的克劳修斯表述是什么？", expect: /克劳修斯|热量|低温|高温/i, file: "thermodynamics.pptx" },
    { q: "碳的电子构型是什么？", expect: /2s2.*2p2|He.*2s.*2p/i, file: "elements.xlsx" },
    { q: "AlphaFold解决的是什么难题？", expect: /蛋白质折叠|protein folding|50年/i, file: "bio.md" },
    { q: "宇宙微波背景辐射的温度大约是多少？", expect: /2\.7|2\.7K|开尔文/i, file: "history.txt" },
  ];

  let qaOk = 0;
  for (let i = 0; i < questions.length; i++) {
    const { q, expect, file } = questions[i];
    process.stdout.write(`    [${i + 1}/${questions.length}] ${q} `);
    const r = await ask(token, q);
    if (r.answer && expect.test(r.answer)) {
      console.log("✓");
      qaOk++;
    } else {
      console.log(`✗ (答案: ${(r.answer || r.err || "").slice(0, 60)})`);
    }
    await sleep(500);
  }
  ok("跨格式问答 ≥5/6 命中", qaOk >= 5, `命中 ${qaOk}/6`);

  // 清理
  await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});

  console.log(`\n${"=".repeat(50)}`);
  console.log(`✅ 通过 ${passed} 项`);
  if (failures.length) { console.log(`❌ 失败 ${failures.length}:`); failures.forEach((f) => console.log(`   - ${f}`)); }
  else console.log("🎉 全部通过！");
  console.log("=".repeat(50));
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => { console.error("异常:", e); process.exit(1); });
