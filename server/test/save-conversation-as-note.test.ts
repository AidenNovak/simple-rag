import { describe, test, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { executeTool, type ToolContext } from "../src/tools/index.js";
import { getPoolClient, closeDb } from "../src/db/client.js";
import { closeRedis } from "../src/jobs/queue.js";

async function seedUserAndConversation(email: string, convoTitle: string, messages: Array<{ role: string; content: string }>) {
  const client = await getPoolClient();
  try {
    const u = await client.query("INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id", [email]);
    const userId = u.rows[0].id;
    const c = await client.query("INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING id", [userId, convoTitle]);
    const convoId = c.rows[0].id;
    for (const m of messages) {
      await client.query("INSERT INTO messages (conversation_id, user_id, role, content) VALUES ($1,$2,$3,$4)", [convoId, userId, m.role, m.content]);
    }
    return { userId, convoId };
  } finally {
    client.release();
  }
}

const baseCtx = (userId: string, conversationId?: string): ToolContext => ({ userId, creds: {} as any, docIds: null, conversationId });

describe("save_conversation_as_note tool", () => {
  let owner: { userId: string; convoId: string };
  let intruder: { userId: string; convoId: string };

  beforeEach(async () => {
    owner = await seedUserAndConversation(
      `save-owner-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`,
      "RAG 方案讨论",
      [
        { role: "user", content: "RAG 用 RRF 还是向量重排好？" },
        { role: "assistant", content: "RRF 对分数量纲不同鲁棒，推荐混合检索用 RRF。" },
      ]
    );
    intruder = await seedUserAndConversation(
      `save-intr-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`,
      "别人私聊",
      [{ role: "user", content: "私密内容不应被沉淀" }]
    );
  });

  afterEach(async () => {
    const client = await getPoolClient();
    try {
      await client.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [[owner.userId, intruder.userId]]);
    } finally {
      client.release();
    }
  });

  after(async () => {
    await closeRedis();
    await closeDb();
  });

  test("saves current conversation as a structured note", async () => {
    const res = await executeTool(
      "save_conversation_as_note",
      { title: "RAG 检索策略", summary: "RRF 优于纯向量" },
      baseCtx(owner.userId, owner.convoId)
    );
    assert.match(res.content, /已创建笔记《RAG 检索策略》/);
    // 验证笔记内容含对话原文 + 摘要
    const client = await getPoolClient();
    try {
      const r = await client.query("SELECT content_md FROM documents WHERE user_id=$1 AND title='RAG 检索策略'", [owner.userId]);
      assert.ok(r.rows.length > 0, "note should be created");
      const md = r.rows[0].content_md;
      assert.ok(md.includes("RRF 对分数量纲"), "note must include conversation content");
      assert.ok(md.includes("RRF 优于纯向量"), "note must include summary");
      assert.ok(md.includes("🙋 用户"), "note must have role markers");
    } finally {
      client.release();
    }
  });

  test("does not leak across tenants (intruder cannot save owner's conversation)", async () => {
    const res = await executeTool(
      "save_conversation_as_note",
      { conversation_id: owner.convoId },
      baseCtx(intruder.userId, intruder.convoId)
    );
    assert.match(res.content, /未找到该对话/);
  });

  test("fails when conversation_id missing and ctx has none", async () => {
    const res = await executeTool("save_conversation_as_note", {}, baseCtx(owner.userId));
    assert.match(res.content, /无法确定要保存的对话/);
  });
});
