/**
 * 并发压测：模拟多用户同时注册 / 摄入 / 问答，测吞吐与稳定性。
 *
 * 场景：
 *   A) 并发注册 N 个用户
 *   B) 每个用户并发写笔记（触发摄入队列）
 *   C) 并发问答（真实 DeepSeek）
 *   D) 同一用户并发多个摄入任务（单 worker 串行消化）
 *
 * 指标：成功率、平均耗时、p95、错误列表。
 */
const API = "http://127.0.0.1:8787";

async function reg(email: string) {
  const r = await fetch(`${API}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "loadtest12345" }),
  });
  const j: any = await r.json();
  return { ok: !!j.token, token: j.token, err: j.error };
}

async function note(token: string, title: string, content: string) {
  const r = await fetch(`${API}/api/documents/note`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title, content }),
  });
  const j: any = await r.json();
  return { ok: r.ok, docId: j.document?.id, err: j.error };
}

async function waitForReady(token: string, docId: string, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await fetch(`${API}/api/documents`, { headers: { Authorization: `Bearer ${token}` } });
    const j: any = await r.json();
    const doc = (j.documents || []).find((d: any) => d.id === docId);
    if (doc?.status === "ready") return true;
    if (doc?.status === "failed") return false;
    await new Promise((x) => setTimeout(x, 1500));
  }
  return false;
}

async function ask(token: string, q: string) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${API}/api/chat/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ question: q }),
    });
    const j: any = await r.json();
    return { ok: r.ok && (j.answer?.length || 0) > 5, ms: Date.now() - t0, err: j.error, len: j.answer?.length };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, err: (e as Error).message, len: 0 };
  }
}

function stats(label: string, arr: { ms: number; ok: boolean }[]) {
  const ok = arr.filter((a) => a.ok);
  const times = ok.map((a) => a.ms).sort((a, b) => a - b);
  const avg = times.length ? Math.round(times.reduce((s, v) => s + v, 0) / times.length) : 0;
  const p95 = times.length ? times[Math.floor(times.length * 0.95)] : 0;
  const max = times.length ? times[times.length - 1] : 0;
  console.log(`  ${label}: ${ok.length}/${arr.length} 成功 | avg ${avg}ms | p95 ${p95}ms | max ${max}ms`);
  return { ok: ok.length, total: arr.length };
}

async function main() {
  console.log("\n⚡ 并发压测开始\n");
  const N = 5; // 5 并发用户（真实 LLM 调用，控制并发避免限流）

  // 【A】并发注册
  console.log(`【A】并发注册 ${N} 用户`);
  const regStart = Date.now();
  const regResults = await Promise.all(
    Array.from({ length: N }, (_, i) => reg(`load_${Date.now()}_${i}@test.com`))
  );
  console.log(`  注册: ${regResults.filter((r) => r.ok).length}/${N} 成功, ${Date.now() - regStart}ms`);
  const tokens = regResults.filter((r) => r.token).map((r) => r.token!);
  if (tokens.length < N) console.log(`  ⚠ 仅 ${tokens.length} 用户注册成功`);

  // 【B】并发写笔记（同时触发摄入）
  console.log(`\n【B】并发写笔记 + 摄入（${tokens.length} 用户同时）`);
  const noteResults = await Promise.all(
    tokens.map((t, i) =>
      note(t, `并发笔记_${i}`, `这是第 ${i} 个用户的并发测试笔记。关键词：量子隧穿、波函数坍缩、贝尔不等式。内容编号 ${i} 用于隔离验证。`)
    )
  );
  console.log(`  笔记创建: ${noteResults.filter((r) => r.ok).length}/${tokens.length} 成功`);

  // 等所有摄入完成
  console.log(`  等待摄入完成…`);
  const ingestWait = await Promise.all(
    tokens.map((t, i) => waitForReady(t, noteResults[i].docId, 90000))
  );
  console.log(`  摄入就绪: ${ingestWait.filter(Boolean).length}/${tokens.length}`);

  // 【C】并发问答（真实 DeepSeek）—— 控制为 3 并发避免 DeepSeek 限流
  console.log(`\n【C】并发问答（3 并发，每用户 1 问）`);
  const askBatch = tokens.slice(0, 3).map((t, i) => ask(t, `并发笔记_${i} 里提到的量子概念有哪些？`));
  const askResults = await Promise.all(askBatch);
  stats("并发问答", askResults);

  // 【D】同一用户并发多个摄入
  console.log(`\n【D】单用户并发 3 个摄入任务`);
  const t0 = tokens[0];
  const multiNotes = await Promise.all([
    note(t0, "并发A", "内容A：哈密顿量描述系统能量。"),
    note(t0, "并发B", "内容B：拉格朗日量描述系统动力学。"),
    note(t0, "并发C", "内容C：诺特定理联系对称性与守恒律。"),
  ]);
  const multiWait = await Promise.all(multiNotes.map((r) => waitForReady(t0, r.docId!, 90000)));
  console.log(`  单用户 3 并发摄入: ${multiWait.filter(Boolean).length}/3 就绪（worker 串行消化）`);

  // 汇总
  const allErrors = [
    ...regResults.filter((r) => !r.ok).map((r) => "reg: " + r.err),
    ...noteResults.filter((r) => !r.ok).map((r) => "note: " + r.err),
    ...askResults.filter((r) => !r.ok).map((r) => "ask: " + r.err),
  ];
  console.log(`\n${"=".repeat(50)}`);
  if (allErrors.length === 0) {
    console.log("✅ 并发压测无错误");
  } else {
    console.log(`❌ ${allErrors.length} 个错误:`);
    allErrors.slice(0, 10).forEach((e) => console.log(`   - ${e}`));
  }
  console.log("=".repeat(50));
  process.exit(allErrors.length > 0 ? 1 : 0);
}

main().catch((e) => { console.error("压测异常:", e); process.exit(1); });
