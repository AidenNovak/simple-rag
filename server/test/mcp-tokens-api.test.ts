import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { mcpTokenRoutes } from "../src/routes/mcp-tokens.js";
import { signJwt } from "../src/auth/jwt.js";
import { getPoolClient } from "../src/db/client.js";

async function seedUser() {
  const client = await getPoolClient();
  try {
    const email = `tokapi-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
    const res = await client.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id, email",
      [email]
    );
    return { id: res.rows[0].id as string, email: res.rows[0].email as string };
  } finally {
    client.release();
  }
}

describe("mcp-tokens api (real listen)", () => {
  let app: FastifyInstance;
  let baseUrl: string;
  let userId: string;
  let jwt: string;

  before(async () => {
    const u = await seedUser();
    userId = u.id;
    jwt = signJwt({ sub: userId, email: u.email });
    app = Fastify();
    await app.register(mcpTokenRoutes, { prefix: "/api" });
    await app.ready();
    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}`;
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

  test("POST /mcp-tokens returns plaintext once", async () => {
    const res = await fetch(`${baseUrl}/api/mcp-tokens`, {
      method: "POST",
      headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
      body: JSON.stringify({ label: "Claude Code @ MBP" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.match(body.token, /^[a-f0-9]{64}$/, "token must be 64 hex chars");
    assert.equal(body.label, "Claude Code @ MBP");
    assert.ok(body.id, "must return token id");
  });

  test("GET /mcp-tokens lists without plaintext", async () => {
    await fetch(`${baseUrl}/api/mcp-tokens`, {
      method: "POST",
      headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
      body: JSON.stringify({ label: "second" }),
    });
    const res = await fetch(`${baseUrl}/api/mcp-tokens`, {
      headers: { authorization: `Bearer ${jwt}` },
    });
    const body = await res.json();
    assert.ok(body.tokens.length >= 1);
    for (const t of body.tokens) {
      assert.equal(t.token, undefined, "must not leak plaintext");
    }
  });

  test("DELETE /mcp-tokens/:id revokes token", async () => {
    const createRes = await fetch(`${baseUrl}/api/mcp-tokens`, {
      method: "POST",
      headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
      body: JSON.stringify({ label: "to-revoke" }),
    });
    const created = await createRes.json();
    const delRes = await fetch(`${baseUrl}/api/mcp-tokens/${created.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${jwt}` },
    });
    assert.equal(delRes.status, 200);
    const delBody = await delRes.json();
    assert.equal(delBody.ok, true);
  });

  test("unauthenticated → 401", async () => {
    const res = await fetch(`${baseUrl}/api/mcp-tokens`);
    assert.equal(res.status, 401);
  });
});
