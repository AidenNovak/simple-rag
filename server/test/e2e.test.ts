/**
 * 端到端 DB 级测试（不需要 LLM API key）。
 *
 * 覆盖：
 *   1. 数据库连接 + schema 完整性（vector 列、索引）
 *   2. 用户注册 + 隔离（两用户互不可见）
 *   3. 文档创建（笔记）+ 摄入管线（chunk → mock embedding → pgvector）
 *   4. 向量检索（ivfflat cosine）召回正确文档
 *   5. 关键词检索（pg_trgm）召回
 *   6. RRF 混合检索
 *   7. 工具调用执行（search_knowledge_base / list_documents / create_note）
 *   8. 多租户隔离：用户B检索不到用户A的内容
 *
 * 运行：EMBEDDING_MODEL=mock npx tsx test/e2e.test.ts
 *
 * 前置：docker/pg 已起 + 迁移已跑。
 */
import assert from "node:assert";
import { runMigrations } from "../src/db/migrate.js";
import { getDb, schema, getPool, closeDb } from "../src/db/client.js";
import { eq } from "drizzle-orm";
import { chunkMarkdown } from "../src/ingest/chunk.js";
import { embedTexts } from "../src/llm/embed.js";
import { retrieve } from "../src/rag/retrieve.js";
import { executeTool, TOOL_DEFS } from "../src/tools/index.js";
import { createUser } from "../src/auth/jwt.js";
import { ingestDocument } from "../src/jobs/pipeline.js";
import { logger } from "../src/config/logger.js";

logger.level = "warn";
let passed = 0;
const failures: string[] = [];

function ok(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  console.log("\n🧪 private-kb 端到端 DB 测试\n");
  console.log("【0】数据库连接 + schema");
  await runMigrations();
  const pool = getPool();
  const client = await pool.connect();
  try {
    const v = await client.query("SELECT extversion FROM pg_extension WHERE extname='vector'");
    ok("pgvector 已安装", v.rows.length === 1, v.rows[0]?.extversion || "missing");
    const t = await client.query("SELECT extversion FROM pg_extension WHERE extname='pg_trgm'");
    ok("pg_trgm 已安装", t.rows.length === 1);
    const idx = await client.query(
      "SELECT indexname FROM pg_indexes WHERE indexname='chunks_embedding_idx'"
    );
    ok("ivfflat 向量索引存在", idx.rows.length === 1);
    const trgm = await client.query(
      "SELECT indexname FROM pg_indexes WHERE indexname='chunks_text_trgm_idx'"
    );
    ok("trigram 全文索引存在", trgm.rows.length === 1);
  } finally {
    client.release();
  }

  console.log("\n【1】多租户隔离 — 创建两用户");
  // 清理旧测试数据
  const db = getDb();
  await db.delete(schema.messages);
  await db.delete(schema.conversations);
  await db.delete(schema.chunks);
  await db.delete(schema.documents);
  await db.delete(schema.users);

  const uA = await createUser("alice@test.com", "password12345");
  const uB = await createUser("bob@test.com", "password12345");
  ok("用户 Alice 创建", !!uA?.id);
  ok("用户 Bob 创建", !!uB?.id);
  ok("两用户 id 不同", uA.id !== uB.id);

  console.log("\n【2】文档摄入 — 笔记 + chunk + embedding");
  const [docA] = await db
    .insert(schema.documents)
    .values({
      userId: uA.id,
      title: "量子力学基础笔记",
      kind: "note",
      sourceFormat: "md",
      contentMd:
        "# 量子力学\n\n薛定谔方程描述了量子态的演化：$i\\hbar\\frac{\\partial}{\\partial t}|\\psi\\rangle = \\hat{H}|\\psi\\rangle$。\n\n波函数的统计诠释由玻恩提出，$|\\psi|^2$ 代表概率密度。\n\n不确定性原理：位置与动量不能同时精确确定，$\\Delta x \\Delta p \\geq \\hbar/2$。\n\n# 固体物理\n\n晶体结构中，电子在周期性势场中运动，形成能带。布里渊区是倒易空间的基本单元。",
      status: "pending",
    })
    .returning();

  const [docB] = await db
    .insert(schema.documents)
    .values({
      userId: uB.id,
      title: "机器学习入门",
      kind: "note",
      sourceFormat: "md",
      contentMd:
        "# 机器学习\n\n监督学习从标注数据学习映射函数。梯度下降是最常用的优化算法。\n\n神经网络通过反向传播更新权重。损失函数衡量预测与真实值的差距。",
      status: "pending",
    })
    .returning();
  ok("Alice 文档创建", !!docA?.id);
  ok("Bob 文档创建", !!docB?.id);

  // 同步跑摄入（mock embedding）
  await ingestDocument({ jobId: "test-a", documentId: docA.id, userId: uA.id });
  await ingestDocument({ jobId: "test-b", documentId: docB.id, userId: uB.id });

  const [docAFinal] = await db.select().from(schema.documents).where(eq(schema.documents.id, docA.id)).limit(1);
  ok("Alice 文档摄入成功（ready）", docAFinal.status === "ready", `status=${docAFinal.status} ${docAFinal.errorMsg || ""}`);

  const chunksA = await db.select().from(schema.chunks).where(eq(schema.chunks.docId, docA.id));
  ok("Alice 生成 chunk > 0", chunksA.length > 0, `count=${chunksA.length}`);

  // 验证 embedding 列真的有向量
  const embCheck = await pool.connect();
  try {
    const r = await embCheck.query(
      "SELECT id, embedding IS NOT NULL AS has_vec, vector_dims(embedding) AS dim FROM chunks WHERE doc_id=$1 LIMIT 1",
      [docA.id]
    );
    ok("chunk embedding 列有值", r.rows[0]?.has_vec === true);
    ok("embedding 维度 = 1024", r.rows[0]?.dim === 1024, `dim=${r.rows[0]?.dim}`);
  } finally {
    embCheck.release();
  }

  console.log("\n【3】向量检索 — Alice 查量子力学");
  const creds = { embeddingModel: "mock" };
  const r1 = await retrieve(uA.id, "薛定谔方程是什么", creds, { topK: 3 });
  ok("检索返回结果", r1.length > 0, `count=${r1.length}`);
  ok("检索命中 Alice 的量子文档", r1.some((c) => c.docTitle.includes("量子") || c.docTitle.includes("力学")), r1.map((c) => c.docTitle).join(", "));
  ok("结果含 score", r1.every((c) => typeof c.score === "number"));

  console.log("\n【4】多租户隔离 — Bob 查不到 Alice 的量子笔记");
  const r2 = await retrieve(uB.id, "薛定谔方程", creds, { topK: 3 });
  ok("Bob 检索不到 Alice 的文档", r2.every((c) => !c.text.includes("薛定谔")), r2.map((c) => c.docTitle).join(", "));
  ok("Bob 只能看到自己的内容", r2.every((c) => c.docTitle.includes("机器学习")) || r2.length === 0);

  console.log("\n【5】关键词检索 — trigram");
  const r3 = await retrieve(uA.id, "布里渊区", creds, { topK: 3 });
  ok("关键词检索命中固体物理内容", r3.some((c) => c.text.includes("布里渊") || c.text.includes("能带")), r3.map((c) => c.docTitle).join(", "));

  console.log("\n【6】工具调用 — search_knowledge_base");
  const toolRes = await executeTool("search_knowledge_base", { query: "不确定性原理", top_k: 3 }, { userId: uA.id, creds });
  ok("search_knowledge_base 返回内容", toolRes.content.length > 0 && !toolRes.content.includes("未检索到"), toolRes.content.slice(0, 80));
  ok("工具返回结构化 data", !!toolRes.data);

  console.log("\n【7】工具调用 — list_documents");
  const listRes = await executeTool("list_documents", {}, { userId: uA.id, creds });
  ok("list_documents 返回 Alice 的文档", listRes.content.includes("量子"), listRes.content.slice(0, 80));
  ok("list_documents 不含 Bob 的文档", !listRes.content.includes("机器学习"));

  console.log("\n【8】工具调用 — create_note");
  const noteRes = await executeTool("create_note", { title: "测试工具创建的笔记", content: "这是通过工具调用自动创建的笔记内容。" }, { userId: uA.id, creds });
  ok("create_note 成功", noteRes.content.includes("已创建"), noteRes.content.slice(0, 80));
  const [createdNote] = await db.select().from(schema.documents).where(eq(schema.documents.title, "测试工具创建的笔记")).limit(1);
  ok("笔记确实写入数据库", !!createdNote, "未在 DB 找到");

  console.log("\n【9】工具定义完整性");
  const names = TOOL_DEFS.map((t) => t.function.name);
  ok("5 个工具已定义", names.length === 5, `count=${names.length}`);
  ok("含 search_knowledge_base", names.includes("search_knowledge_base"));
  ok("含 keyword_search", names.includes("keyword_search"));
  ok("含 list_documents", names.includes("list_documents"));
  ok("含 create_note", names.includes("create_note"));
  ok("工具定义有合法 JSON Schema", TOOL_DEFS.every((t) => t.function.parameters?.type === "object"));

  console.log("\n【10】chunkMarkdown 切分逻辑");
  const chunks = chunkMarkdown("# 标题1\n\n段落A内容。\n\n# 标题2\n\n段落B内容更长一些用来测试切分边界情况。\n\n<!-- page=5 -->\n第三段带页码。", { maxChars: 50, overlap: 10 });
  ok("切分产生多个 chunk", chunks.length >= 2, `count=${chunks.length}`);
  ok("locator 页码被提取", chunks.some((c) => c.locator && c.locator.page === 5), JSON.stringify(chunks.map((c) => c.locator)));

  // ---- 汇总 ----
  console.log(`\n${"=".repeat(50)}`);
  console.log(`✅ 通过 ${passed} 项`);
  if (failures.length) {
    console.log(`❌ 失败 ${failures.length} 项：`);
    failures.forEach((f) => console.log(`   - ${f}`));
  } else {
    console.log("🎉 全部通过！");
  }
  console.log("=".repeat(50));
}

main()
  .catch((e) => {
    console.error("测试执行出错：", e);
    failures.push("执行异常: " + e.message);
  })
  .finally(async () => {
    await closeDb();
    // 测试脚本：强退，避免 pool/redis idle timer 阻塞退出
    process.exit(failures.length > 0 ? 1 : 0);
  });
