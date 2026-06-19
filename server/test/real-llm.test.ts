/**
 * 真实 LLM 端到端测试（需要真实 API key）。
 *
 * 覆盖：
 *   1. 智谱 embedding-3 真实调用（1024 维）
 *   2. 文档摄入 → 真实 embedding 入 pgvector
 *   3. 真实向量检索召回
 *   4. DeepSeek v4-pro 工具调用问答（function calling）
 *   5. 工具结果回填后生成带引用答案
 *
 * 运行：npx tsx test/real-llm.test.ts（需 .env 配好真实 key）
 */
import assert from "node:assert";
import { runMigrations } from "../src/db/migrate.js";
import { getDb, schema, getPool, closeDb } from "../src/db/client.js";
import { eq } from "drizzle-orm";
import { embedTexts, embedOne } from "../src/llm/embed.js";
import { agentAnswer } from "../src/rag/agent.js";
import { retrieve } from "../src/rag/retrieve.js";
import { ingestDocument } from "../src/jobs/pipeline.js";
import { createUser } from "../src/auth/jwt.js";
import { config } from "../src/config/index.js";
import { logger } from "../src/config/logger.js";

logger.level = "warn";
let passed = 0;
const failures: string[] = [];
const ok = (name: string, cond: boolean, detail?: string) => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ""}`); console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("\n🔬 真实 LLM 端到端测试\n");
  console.log(`   chat: ${config.chatModel} @ ${config.chatBaseUrl}`);
  console.log(`   embed: ${config.embeddingModel} @ ${config.embeddingBaseUrl}\n`);

  await runMigrations();
  const db = getDb();
  const pool = getPool();

  // 清理
  await db.delete(schema.messages); await db.delete(schema.conversations);
  await db.delete(schema.chunks); await db.delete(schema.documents);
  await db.delete(schema.users);

  console.log("【1】智谱 embedding-3 真实调用");
  const emb1 = await embedTexts(["量子力学薛定谔方程", "今天天气很好"]);
  ok("embedding 返回 2 个向量", emb1.vectors.length === 2);
  ok("向量维度 = 1024", emb1.vectors[0].length === 1024, `dim=${emb1.vectors[0].length}`);
  ok("usage 有 token 数", emb1.usage.totalTokens > 0, `tokens=${emb1.usage.totalTokens}`);
  // 相似文本余弦更近
  const v1 = emb1.vectors[0], v2 = await embedOne("薛定谔方程是量子力学的核心");
  const cos = dot(v1, v2) / (norm(v1) * norm(v2));
  ok("语义相似文本余弦 > 0.5", cos > 0.5, `cos=${cos.toFixed(3)}`);

  console.log("\n【2】文档摄入（真实 embedding → pgvector）");
  const user = await createUser("realtest@test.com", "password12345");
  const [doc] = await db.insert(schema.documents).values({
    userId: user.id,
    title: "石墨烯与拓扑绝缘体研究笔记",
    kind: "note",
    sourceFormat: "md",
    contentMd: `# 石墨烯

石墨烯是一种由碳原子以二维蜂窝晶格排列构成的单层材料。2004 年由 Geim 和 Novoselov 首次通过机械剥离法分离，他们因此获得 2010 年诺贝尔物理学奖。

石墨烯具有极高的电子迁移率（约 200000 cm²/V·s），是硅的 100 倍以上。其能带结构在狄拉克点呈线性色散关系，电子行为如同无质量狄拉克费米子。

# 拓扑绝缘体

拓扑绝缘体是一种体态绝缘、表面态导电的量子材料。其表面态受时间反演对称性保护，背散射被禁止。典型材料包括 Bi₂Se₃ 和 Bi₂Te₃。

拓扑不变量用 Z₂ 不变量刻画。量子自旋霍尔效应是其在二维的体现，边缘态可无能耗传输电流，对未来低功耗电子器件意义重大。`,
    status: "pending",
  }).returning();
  await ingestDocument({ jobId: "real", documentId: doc.id, userId: user.id });

  const [docF] = await db.select().from(schema.documents).where(eq(schema.documents.id, doc.id)).limit(1);
  ok("摄入完成（ready）", docF.status === "ready", `status=${docF.status} ${docF.errorMsg || ""}`);
  const c = await pool.connect();
  try {
    const r = await c.query("SELECT vector_dims(embedding) AS d FROM chunks WHERE doc_id=$1 LIMIT 1", [doc.id]);
    ok("chunk embedding 维度正确", r.rows[0]?.d === 1024, `dim=${r.rows[0]?.d}`);
  } finally { c.release(); }

  console.log("\n【3】真实向量检索");
  const r1 = await retrieve(user.id, "石墨烯的电子迁移率是多少", { chatModel: config.chatModel }, { topK: 3 });
  ok("检索返回结果", r1.length > 0, `count=${r1.length}`);
  ok("命中石墨烯内容", r1.some((x) => x.text.includes("石墨烯") || x.text.includes("迁移率")), r1.map((x) => x.text.slice(0, 20)).join("|"));

  console.log("\n【4】DeepSeek v4-pro 工具调用问答");
  const result = await agentAnswer(user.id, "石墨烯的电子迁移率大约是多少？请基于知识库回答。", { chatModel: config.chatModel });
  console.log("   [answer 预览]", result.answer.slice(0, 150));
  ok("生成非空答案", result.answer.length > 10, `len=${result.answer.length}`);
  ok("调用了工具（检索）", result.toolCalls.length > 0, `toolCalls=${JSON.stringify(result.toolCalls.map(t => t.name))}`);
  ok("检索到知识库内容", result.toolCalls.some((t) => t.name === "search_knowledge_base"), result.toolCalls.map((t) => t.name).join(","));
  ok("答案含来源引用 [n]", /\[\d+\]/.test(result.answer) || result.citations.length > 0, `citations=${result.citations.length}`);
  ok("答案含数值 200000", /200000|200,000|2\s*×\s*10/.test(result.answer), "答案未含迁移率数值");

  console.log("\n【5】稳定性 — 连续 3 次问答");
  let success = 0;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await agentAnswer(user.id, "拓扑绝缘体的表面态有什么特性？", { chatModel: config.chatModel });
      if (r.answer.length > 10) { success++; console.log(`   第${i + 1}次: OK (${r.answer.length} 字)`); }
      else console.log(`   第${i + 1}次: 答案过短`);
    } catch (e) { console.log(`   第${i + 1}次: 失败 ${(e as Error).message.slice(0, 60)}`); }
    await sleep(1000);
  }
  ok("连续问答 ≥2/3 成功", success >= 2, `success=${success}/3`);

  console.log(`\n${"=".repeat(50)}`);
  console.log(`✅ 通过 ${passed} 项`);
  if (failures.length) { console.log(`❌ 失败 ${failures.length} 项:`); failures.forEach((f) => console.log(`   - ${f}`)); }
  else console.log("🎉 全部通过！");
  console.log("=".repeat(50));
}
function dot(a: number[], b: number[]) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
function norm(a: number[]) { return Math.sqrt(a.reduce((s, v) => s + v * v, 0)); }

main().catch((e) => { console.error("测试异常:", e); failures.push("异常: " + e.message); })
  .finally(async () => { await closeDb(); process.exit(failures.length ? 1 : 0); });
