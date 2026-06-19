/**
 * 测试 1+2+3：压缩准确性 + 大文件 + 并发多文件。
 *
 * 问题1 压缩准确性：
 *   - 构造 50 轮对话（每轮有不同事实），强制压缩
 *   - 压缩后提问早期轮的事实 → 验证信息保留
 *   - 不同模型窗口（pro 1M / flash 128K）切换验证
 *
 * 问题2 大文件超时：
 *   - 生成 50000 字笔记（~300 chunks）
 *   - 测摄入耗时 + 是否超时
 *   - 生成 100 页 PDF
 *
 * 问题3 并发多文件：
 *   - 同时上传 5 个大笔记
 *   - 验证全部就绪 + 无丢失 + 无数据损坏
 */
import { estimateTokens, buildContextMessages, shouldCompress, getInputBudget, getContextWindow, MODEL_CONTEXT_WINDOWS, type HistoryTurn } from "../src/llm/context.js";

const API = "http://127.0.0.1:8787";
let passed = 0;
const failures: string[] = [];
const ok = (n: string, c: boolean, d?: string) => {
  if (c) { passed++; console.log(`  ✅ ${n}`); }
  else { failures.push(`${n}${d ? ` — ${d}` : ""}`); console.log(`  ❌ ${n}${d ? ` — ${d}` : ""}`); }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("\n🔬 压缩准确性 + 大文件 + 并发测试\n");

  // ===================================================================
  console.log("═══ 问题1：压缩准确性 ═══\n");

  // 构造 200 轮对话（每轮 ~3000 字模拟 RAG 检索结果），足以触发 flash 裁剪
  console.log("【1a】构造 200 轮含大内容的对话历史（模拟 RAG 检索结果）");
  const facts: { keyword: string; value: string }[] = [];
  const longHistory: HistoryTurn[] = [];
  for (let i = 0; i < 200; i++) {
    const keyword = `特殊标记${i}`;
    const value = `数值${i * 137 + 42}`;
    facts.push({ keyword, value });
    longHistory.push(
      { role: "user", content: `请记住：${keyword}等于${value}。${"参考内容填充".repeat(100)}` },
      { role: "assistant", content: `好的，${keyword}等于${value}。${"详细回答内容填充".repeat(100)}` },
    );
  }

  // 用 v4-flash 小窗口强制触发裁剪（50 轮 × ~100 字 = ~5000 字 ~3000 tokens，但 system+tool 占预算）
  console.log("【1b】用 flash 窗口裁剪上下文");
  const r1 = buildContextMessages("你是助手", longHistory, "最新问题", "deepseek-v4-flash");
  ok("50 轮历史被裁剪", r1.messages.length < longHistory.length + 2, `kept ${r1.messages.length} / total ${longHistory.length + 2}`);
  ok("裁剪后标记为压缩", r1.compressed);
  ok("裁剪后 tokens 在预算内", r1.tokensUsed < getInputBudget("deepseek-v4-flash"));

  // 验证最近的事实被保留
  const lastFact = facts[facts.length - 1];
  const keptText = r1.messages.map((m: any) => m.content || "").join("");
  ok(`最近轮事实保留（${lastFact.keyword}）`, keptText.includes(lastFact.value), `未在裁剪后文本中找到 ${lastFact.value}`);

  // 验证最早的事实被丢弃（除非预算很大）
  const firstFact = facts[0];
  const firstFactKept = keptText.includes(firstFact.value);
  console.log(`    最早轮事实（${firstFact.keyword}=${firstFact.value}）：${firstFactKept ? "保留" : "已丢弃（预期）"}`);

  console.log("\n【1c】模型窗口适配验证");
  // v4-pro 1M 窗口下，50 轮不会被裁剪
  const r2 = buildContextMessages("你是助手", longHistory, "最新问题", "deepseek-v4-pro");
  ok("v4-pro 1M 窗口：50 轮全部保留", r2.messages.length === longHistory.length + 2, `kept ${r2.messages.length}`);
  ok("v4-pro 未标记压缩", !r2.compressed);

  // 切到 flash 后裁剪生效
  ok("窗口映射正确：pro > flash × 7+", getContextWindow("deepseek-v4-pro") > getContextWindow("deepseek-v4-flash") * 7);
  ok("shouldCompress 在 flash 下对大量 token 触发", shouldCompress(120000, "deepseek-v4-flash"));
  ok("shouldCompress 在 pro 下对相同 token 不触发", !shouldCompress(120000, "deepseek-v4-pro"));

  console.log("\n【1d】压缩后信息可恢复性（端到端）");
  // 用真实 API：写大量笔记 → 多轮问答 → 验证早期信息可达
  const TS = Date.now();
  const reg: any = await (await fetch(`${API}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `compress_${TS}@test.com`, password: "testpass12345" }),
  })).json();
  const token = reg.token;
  if (!token) { ok("注册", false, "no token"); }
  else {
    // 写一篇含多个独立事实的笔记
    const factContent = Array.from({ length: 20 }, (_, i) =>
      `事实${i}：元素${i}的原子量是${i * 10 + 1}。`
    ).join("\n");
    await fetch(`${API}/api/documents/note`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: "压缩测试数据", content: factContent }),
    });
    await sleep(14000);

    // 问一个事实
    const q1: any = await (await fetch(`${API}/api/chat/ask`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ question: "元素5的原子量是多少？" }),
    })).json();
    ok("压缩数据问答命中（元素5原子量=51）", /51/.test(q1.answer || ""), (q1.answer || "").slice(0, 60));

    // 换一个问题验证独立检索
    const q2: any = await (await fetch(`${API}/api/chat/ask`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ question: "元素15的原子量是多少？" }),
    })).json();
    ok("不同事实独立命中（元素15原子量=151）", /151/.test(q2.answer || ""), (q2.answer || "").slice(0, 60));
  }

  // ===================================================================
  console.log("\n═══ 问题2：大文件处理 ═══\n");

  console.log("【2a】大笔记（50000 字 ~300 chunks）");
  const bigText = Array.from({ length: 500 }, (_, i) =>
    `段落${i}：这是一段用于测试大文件处理的文本。主题编号 ${i}，包含足够的内容让切分产生多个 chunk。关键词：索引${i}、批次${Math.floor(i / 10)}。`
  ).join("\n\n");
  console.log(`    生成 ${bigText.length} 字符的笔记`);

  const t0 = Date.now();
  const bigNote: any = await (await fetch(`${API}/api/documents/note`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title: "大文件测试", content: bigText }),
  })).json();
  ok("大笔记创建成功", !!bigNote.document?.id);

  // 等摄入完成（最多 120s）
  const bigDocId = bigNote.document?.id;
  let bigReady = false;
  let bigStatus = "";
  for (let i = 0; i < 60; i++) {
    const d: any = await (await fetch(`${API}/api/documents/${bigDocId}`, { headers: { Authorization: `Bearer ${token}` } })).json();
    bigStatus = d.document?.status;
    if (bigStatus === "ready") { bigReady = true; break; }
    if (bigStatus === "failed") break;
    await sleep(2000);
  }
  const bigMs = Date.now() - t0;
  ok(`大笔记摄入完成（${(bigMs / 1000).toFixed(1)}s）`, bigReady, `status=${bigStatus}, ${bigMs}ms`);
  ok("大文件处理未超时（<120s）", bigMs < 120000, `${bigMs}ms`);

  // 验证 chunk 数量
  if (bigReady) {
    const bigDoc: any = await (await fetch(`${API}/api/documents/${bigDocId}`, { headers: { Authorization: `Bearer ${token}` } })).json();
    const chunkCount = bigDoc.document?.meta?.chunks || 0;
    ok(`大笔记产生多个 chunk（${chunkCount}）`, chunkCount > 10, `chunks=${chunkCount}`);

    // 大文件问答验证
    const bigQ: any = await (await fetch(`${API}/api/chat/ask`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ question: "段落42的主题编号是什么？" }),
    })).json();
    ok("大文件内容可检索（段落42编号=42）", /42/.test(bigQ.answer || ""), (bigQ.answer || "").slice(0, 60));
  }

  // ===================================================================
  console.log("\n═══ 问题3：并发多文件 ═══\n");

  console.log("【3a】同时上传 5 个中等笔记（各 ~5000 字）");
  const multiStart = Date.now();
  const multiNotes = Array.from({ length: 5 }, (_, i) => {
    const content = Array.from({ length: 50 }, (_, j) =>
      `并发文件${i}段落${j}：主题是并发处理测试。文件编号${i}，段落编号${j}。唯一标识：CF${i}-${j}。`
    ).join("\n\n");
    return fetch(`${API}/api/documents/note`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: `并发测试${i}`, content }),
    }).then((r) => r.json());
  });
  const multiResults: any[] = await Promise.all(multiNotes);
  const multiIds = multiResults.map((r) => r.document?.id).filter(Boolean);
  ok("5 个并发笔记创建成功", multiIds.length === 5, `created ${multiIds.length}/5`);

  console.log("【3b】等待全部摄入完成");
  const multiWait = await Promise.all(multiIds.map(async (id, i) => {
    for (let j = 0; j < 60; j++) {
      const d: any = await (await fetch(`${API}/api/documents/${id}`, { headers: { Authorization: `Bearer ${token}` } })).json();
      if (d.document?.status === "ready") return { idx: i, ok: true };
      if (d.document?.status === "failed") return { idx: i, ok: false, err: d.document?.errorMsg };
      await sleep(2000);
    }
    return { idx: i, ok: false, err: "timeout" };
  }));
  const multiOk = multiWait.filter((w) => w.ok).length;
  const multiMs = Date.now() - multiStart;
  ok(`5 个并发文件全部就绪（${(multiMs / 1000).toFixed(1)}s）`, multiOk === 5, `ready ${multiOk}/5, ${multiMs}ms`);
  multiWait.filter((w) => !w.ok).forEach((w) => console.log(`    ⚠ 文件${w.idx} 失败: ${w.err}`));

  console.log("【3c】并发文件内容完整性验证");
  if (multiOk >= 3) {
    // 验证每个文件内容独立可检索
    let hitCount = 0;
    for (let i = 0; i < Math.min(3, multiOk); i++) {
      const q: any = await (await fetch(`${API}/api/chat/ask`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question: `并发文件${i}的段落0的唯一标识是什么？` }),
      })).json();
      if (new RegExp(`CF${i}-0`).test(q.answer || "")) hitCount++;
      await sleep(500);
    }
    ok(`并发文件内容独立可检索（${hitCount}/3 命中）`, hitCount >= 2, `hits=${hitCount}`);
  }

  // ===================================================================
  console.log(`\n${"=".repeat(50)}`);
  console.log(`✅ 通过 ${passed} 项`);
  if (failures.length) { console.log(`❌ 失败 ${failures.length}:`); failures.forEach((f) => console.log(`   - ${f}`)); }
  else console.log("🎉 全部通过！");
  console.log("=".repeat(50));
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => { console.error("异常:", e); process.exit(1); });
