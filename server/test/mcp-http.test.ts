import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { mcpRoutes } from "../src/routes/mcp.js";
import { createMcpToken } from "../src/mcp/auth.js";
import { getPoolClient } from "../src/db/client.js";

async function seedUser() {
  const client = await getPoolClient();
  try {
    const res = await client.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id",
      [`mcp-http-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`]
    );
    return res.rows[0].id as string;
  } finally {
    client.release();
  }
}

/**
 * 真实 HTTP listen + fetch 测试。
 * Fastify inject 的 mock socket 不支持 SSE 的 destroySoon，会误报失败，
 * 故改用真实监听端口验证端到端行为（更接近真实 harness 调用）。
 *
 * MCP 无状态模式用 SSE 响应（event: message + data: <json>），
 * 也可能返回纯 JSON（单次响应）。rpcCall 统一解析出 JSON 对象。
 */
async function rpcCall(baseUrl: string, token: string | null, payload: any) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}/api/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body: any;
  // SSE 响应：解析 data: 行取 JSON；纯 JSON 直接 parse
  if (text.startsWith("event:") || text.startsWith("data:")) {
    const dataLines = text
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim());
    body = dataLines.length ? JSON.parse(dataLines[dataLines.length - 1]) : null;
  } else {
    body = text ? JSON.parse(text) : null;
  }
  return { status: res.status, body };
}

describe("mcp http route (real listen)", () => {
  let app: FastifyInstance;
  let baseUrl: string;
  let userId: string;
  let token: string;

  before(async () => {
    userId = await seedUser();
    ({ plaintext: token } = await createMcpToken(userId, "http-test"));
    app = Fastify();
    await app.register(mcpRoutes, { prefix: "/api" });
    await app.ready();
    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    if (addr && typeof addr === "object") {
      baseUrl = `http://127.0.0.1:${addr.port}`;
    }
  });

  after(async () => {
    await app.close();
    const client = await getPoolClient();
    try {
      await client.query("DELETE FROM users WHERE id = $1", [userId]);
    } finally {
      client.release();
    }
  });

  test("initialize handshake with valid token", async () => {
    const { status, body } = await rpcCall(baseUrl, token, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0" },
      },
    });
    assert.equal(status, 200);
    assert.equal(body.result.protocolVersion, "2024-11-05");
    assert.ok(body.result.capabilities.tools, "server must advertise tools capability");
  });

  test("missing token → 401", async () => {
    const { status } = await rpcCall(baseUrl, null, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "1" } },
    });
    assert.equal(status, 401);
  });

  test("invalid token → 401", async () => {
    const { status } = await rpcCall(baseUrl, "0".repeat(64), {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "1" } },
    });
    assert.equal(status, 401);
  });

  test("tools/list with valid token returns 4 tools", async () => {
    const { status, body } = await rpcCall(baseUrl, token, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });
    assert.equal(status, 200);
    const names = body.result.tools.map((t: any) => t.name);
    assert.ok(names.includes("search"), "missing search");
    assert.ok(names.includes("keyword_search"), "missing keyword_search");
    assert.ok(names.includes("list_documents"), "missing list_documents");
    assert.ok(names.includes("read_chunk"), "missing read_chunk");
  });

  test("tools/call list_documents with valid token works", async () => {
    const { status, body } = await rpcCall(baseUrl, token, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "list_documents", arguments: {} },
    });
    assert.equal(status, 200);
    assert.ok(body.result.content[0].text, "tool must return text content");
  });
});
