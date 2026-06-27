import { describe, test, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { executeTool, type ToolContext } from "../src/tools/index.js";
import { getPoolClient, closeDb } from "../src/db/client.js";
import { closeRedis } from "../src/jobs/queue.js";

async function seedUserAndConversation(email: string, convoTitle: string, userMsg: string, assistantMsg: string) {
  const client = await getPoolClient();
  try {
    const u = await client.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id",
      [email]
    );
    const userId = u.rows[0].id;
    const c = await client.query(
      "INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING id",
      [userId, convoTitle]
    );
    const convoId = c.rows[0].id;
    await client.query(
      "INSERT INTO messages (conversation_id, user_id, role, content) VALUES ($1,$2,'user',$3), ($1,$2,'assistant',$4)",
      [convoId, userId, userMsg, assistantMsg]
    );
    return { userId, convoId };
  } finally {
    client.release();
  }
}

const baseCtx = (userId: string): ToolContext => ({ userId, creds: {} as any, docIds: null });

describe("search_conversations tool", () => {
  let alice: { userId: string; convoId: string };
  let bob: { userId: string; convoId: string };

  beforeEach(async () => {
    alice = await seedUserAndConversation(
      `convo-alice-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`,
      "RAG 架构讨论",
      "我想了解一下 pgvector 怎么做向量检索",
      "pgvector 用 ivfflat 索引做近似最近邻检索"
    );
    bob = await seedUserAndConversation(
      `convo-bob-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`,
      "私事",
      "周末去爬山了吗",
      "周末天气不错适合户外"
    );
  });

  afterEach(async () => {
    const client = await getPoolClient();
    try {
      await client.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [[alice.userId, bob.userId]]);
    } finally {
      client.release();
    }
  });

  after(async () => {
    await closeRedis();
    await closeDb();
  });

  test("finds matching conversation by keyword", async () => {
    const res = await executeTool("search_conversations", { query: "pgvector 向量检索" }, baseCtx(alice.userId));
    assert.match(res.content, /pgvector/);
    assert.ok(res.content.includes("RAG 架构讨论"), "should include conversation title");
  });

  test("does not leak across tenants (bob cannot search alice's conversations)", async () => {
    const res = await executeTool("search_conversations", { query: "pgvector" }, baseCtx(bob.userId));
    assert.match(res.content, /未在历史对话中找到/, "bob must not see alice's conversations");
  });

  test("returns not-found for unrelated keyword", async () => {
    const res = await executeTool("search_conversations", { query: "量子力学zzz" }, baseCtx(alice.userId));
    assert.match(res.content, /未在历史对话中找到/);
  });
});
