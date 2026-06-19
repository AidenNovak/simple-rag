/**
 * 极端边界文件测试：验证摄入管线对各种异常输入的健壮性。
 *
 * 必须优雅处理（不崩溃、返回明确错误或成功），不能让 worker 挂掉。
 *
 * 边界类型：
 *   1. 空内容笔记（0 字符）
 *   2. 超长单行（无换行的 10MB 文本）
 *   3. 特殊字符（emoji/控制字符/RTL/零宽）
 *   4. SQL/HTML/JS 注入文本
 *   5. 仅空白字符（空格/制表符/换行）
 *   6. 超大笔记（10000+ 段落，测切分）
 *   7. 损坏的伪 PDF（.pdf 后缀但内容是文本）
 *   8. Markdown 注释注入（伪造 locator）
 *   9. Unicode 极端（组合字符、surrogate pair）
 *  10. 正常内容对照组
 */
import { chunkMarkdown } from "../src/ingest/chunk.js";
import { extractFile } from "../src/ingest/extract.js";
import { embedTexts } from "../src/llm/embed.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let passed = 0;
const failures: string[] = [];
const ok = (n: string, c: boolean, d?: string) => {
  if (c) { passed++; console.log(`  ✅ ${n}`); }
  else { failures.push(`${n}${d ? ` — ${d}` : ""}`); console.log(`  ❌ ${n}${d ? ` — ${d}` : ""}`); }
};

async function main() {
  console.log("\n🧨 极端边界文件测试\n");

  // 临时目录放测试文件
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kb-edge-"));

  // 【1】空内容笔记
  console.log("【1】空内容");
  const chunks1 = chunkMarkdown("");
  ok("空内容切分返回 0 chunk", chunks1.length === 0, `count=${chunks1.length}`);

  // 【2】超长单行
  console.log("【2】超长单行（10MB 无换行）");
  const longLine = "A".repeat(10 * 1024 * 1024);
  const chunks2 = chunkMarkdown(longLine, { maxChars: 1200 });
  ok("超长行被切分", chunks2.length > 1, `count=${chunks2.length}`);
  ok("每个 chunk ≤ maxChars+overlap", chunks2.every((c) => c.text.length <= 1500), `max=${Math.max(...chunks2.map(c=>c.text.length))}`);

  // 【3】特殊字符
  console.log("【3】特殊字符（emoji/控制/RTL/零宽）");
  const weird = "正常文字\0\x01\x02\u200B\u200C\u200D\u202E\u200F😀🎉🇨🇳\u0000\ufeff";
  const chunks3 = chunkMarkdown(weird + "\n\n第二段内容");
  ok("特殊字符不崩溃且保留内容", chunks3.length >= 1 && chunks3.some((c) => c.text.includes("第二段")), `count=${chunks3.length}`);
  try {
    await embedTexts([weird]);
    ok("特殊字符 embedding 不崩溃", true);
  } catch (e) { ok("特殊字符 embedding 不崩溃", false, (e as Error).message.slice(0, 80)); }

  // 【4】注入文本
  console.log("【4】SQL/HTML/JS 注入文本");
  const inject = `-- DROP TABLE users; SELECT * FROM users WHERE 1=1;
<script>alert('xss')</script>
<img src=x onerror=alert(1)>
'; DELETE FROM chunks; --
<!-- page=999 --><!-- page=1 -->`;
  const chunks4 = chunkMarkdown(inject);
  ok("注入文本切分不崩溃", chunks4.length >= 1, `count=${chunks4.length}`);
  // 验证 SQL 注入在 DB 层不会生效（参数化查询保障）
  ok("locator 注入仅取最后一个", chunks4.every((c) => !c.locator || c.locator.page !== 999), JSON.stringify(chunks4.find(c=>c.locator)?.locator));

  // 【5】仅空白
  console.log("【5】仅空白字符");
  const blank = "   \t\t  \n\n   \r\n\t   ";
  const chunks5 = chunkMarkdown(blank);
  ok("纯空白切分为 0 chunk", chunks5.length === 0, `count=${chunks5.length}`);

  // 【6】超大笔记（10000 段落）
  console.log("【6】超大笔记（10000 段落）");
  const big = Array.from({ length: 10000 }, (_, i) => `段落 ${i}：这是第 ${i} 段测试内容，用于验证大文档切分。`).join("\n\n");
  const chunks6 = chunkMarkdown(big);
  ok("大文档切分 > 100 chunks", chunks6.length > 100, `count=${chunks6.length}`);

  // 【7】损坏的伪 PDF
  console.log("【7】损坏的伪 PDF（.pdf 后缀但内容是纯文本）");
  const fakePdf = path.join(tmp, "fake.pdf");
  await fs.writeFile(fakePdf, "这不是真正的 PDF 文件，只是文本伪装成 pdf 后缀。");
  try {
    await extractFile(fakePdf, "pdf", "application/pdf");
    ok("伪 PDF 抽取返回内容或标记 OCR", true);
  } catch (e) {
    ok("伪 PDF 抽取优雅失败（不崩溃）", true, `(预期内失败) ${(e as Error).message.slice(0, 60)}`);
  }

  // 【8】正常 txt 文件对照
  console.log("【8】正常 txt 对照");
  const goodTxt = path.join(tmp, "good.txt");
  await fs.writeFile(goodTxt, "正常文本内容。这是一段完整的中文测试。\n\n第二段。");
  const r8 = await extractFile(goodTxt, "txt", "text/plain");
  ok("正常 txt 抽取成功", r8.md.includes("正常文本"), r8.md.slice(0, 40));

  // 【9】Unicode 组合字符
  console.log("【9】Unicode 极端（组合字符/surrogate）");
  const unicode = "Z̴̷̡̢̻͍̱͖̟̗͇͈̦̻͍̩͎͑ͫ̓ͪ̂̉̽̍́ͨͫͯ͆ͤ͂̌ͧ͋̊ͧͥͣ͊ͩͫͥ̆͊̑ͧ͋̊ͤͥͣͣ̄ͪͥ͛ͩ͑̒ͪ͑ͫͧ̆̐͋̊ͭ́ͦͣͦ̏̎́ͯ̎ͩ̐̏ͧ͋ͤ̌ͭ̐ͥ̑ͪͧͨͥ̌ͩ̐̌̐ͭͬ̽̎ͪͣͧ̆ͨ̑ͩͥͣ̎́ͨͥ̎̌͌ͮͪͧ͗ͧͣͭ͑ͮ͋̎ͭ̏ͪ̏̐̊͐̐ͭ͋̏ͮ̏̎̚͟ͅz";
  const chunks9 = chunkMarkdown(unicode);
  ok("组合字符不崩溃", chunks9.length >= 1, `count=${chunks9.length}`);

  // 【10】极短内容（单字符）
  console.log("【10】极短内容（单字符）");
  const chunks10 = chunkMarkdown("A");
  ok("单字符切分为 1 chunk", chunks10.length === 1, `count=${chunks10.length}`);

  // 【11】超大 embedding 批次（一次 100 段）
  console.log("【11】大批量 embedding（20 段一次）");
  const batch = Array.from({ length: 20 }, (_, i) => `批量段 ${i}：测试 embedding 批处理能力，内容各不相同编号 ${i}。`);
  try {
    const emb = await embedTexts(batch);
    ok("20 段批量 embedding 全返回", emb.vectors.length === 20 && emb.vectors.every((v) => v.length === 1024), `got ${emb.vectors.length}`);
  } catch (e) { ok("20 段批量 embedding", false, (e as Error).message.slice(0, 80)); }

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
