import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createMcpServer } from "../src/mcp/server.js";
import { getPoolClient } from "../src/db/client.js";

async function seedUserAndDoc(email: string, docTitle: string) {
  const client = await getPoolClient();
  try {
    const u = await client.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id",
      [email]
    );
    const userId = u.rows[0].id;
    const d = await client.query(
      "INSERT INTO documents (user_id, title, kind, status) VALUES ($1, $2, 'note', 'ready') RETURNING id",
      [userId, docTitle]
    );
    const docId = d.rows[0].id;
    // 插一个 chunk（embedding 用 NULL，keyword_search/list_documents 不依赖向量）
    await client.query(
      "INSERT INTO chunks (user_id, doc_id, ordinal, text) VALUES ($1, $2, 0, $3)",
      [userId, docId, `${docTitle} 的正文内容，含关键词唯一标记 ${email}`]
    );
    return { userId, docId };
  } finally {
    client.release();
  }
}

/**
 * 直接调用注册的工具 handler。
 * createMcpServer 返回的 McpServer 内部有 _registeredTools（按工具名索引），
 * 每个 RegisteredTool 含 handler。绕过传输层，直接调 handler 验证业务逻辑 + 跨租户隔离。
 */
async function callTool(
  server: ReturnType<typeof createMcpServer>,
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const tools = (server as any)._registeredTools;
  const entry = tools[name];
  if (!entry) throw new Error(`tool ${name} not registered`);
  const result = await entry.handler(args, {});
  return String(result.content[0].text);
}

describe("mcp server tools", () => {
  let userA: { userId: string; docId: string };
  let userB: { userId: string; docId: string };

  beforeEach(async () => {
    userA = await seedUserAndDoc("mcp-a@test.local", "用户A的私密文档");
    userB = await seedUserAndDoc("mcp-b@test.local", "用户B的私密文档");
  });

  afterEach(async () => {
    const client = await getPoolClient();
    try {
      await client.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [
        [userA.userId, userB.userId],
      ]);
    } finally {
      client.release();
    }
  });

  test("list_documents only returns caller's docs (跨租户隔离)", async () => {
    const server = createMcpServer({ authenticate: async () => userA.userId });
    const text = await callTool(server, "list_documents", {});
    assert.ok(text.includes("用户A的私密文档"), "should see own doc");
    assert.ok(!text.includes("用户B的私密文档"), "must NOT see other tenant's doc");
  });

  test("keyword_search only searches caller's chunks", async () => {
    const server = createMcpServer({ authenticate: async () => userB.userId });
    const text = await callTool(server, "keyword_search", { query: "mcp-b@test.local" });
    assert.ok(text.includes("用户B的私密文档"), "should find own chunk");
    assert.ok(!text.includes("用户A"), "must NOT search other tenant");
  });

  test("authenticate returning null → tool throws auth error", async () => {
    const server = createMcpServer({ authenticate: async () => null });
    await assert.rejects(
      () => callTool(server, "list_documents", {}),
      /unauthorized/i
    );
  });

  test("tools are registered: search, keyword_search, list_documents, read_chunk", async () => {
    const server = createMcpServer({ authenticate: async () => userA.userId });
    const tools = (server as any)._registeredTools;
    assert.ok(tools.search, "missing search tool");
    assert.ok(tools.keyword_search, "missing keyword_search tool");
    assert.ok(tools.list_documents, "missing list_documents tool");
    assert.ok(tools.read_chunk, "missing read_chunk tool");
  });
});
