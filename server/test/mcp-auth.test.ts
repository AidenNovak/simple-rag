import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createMcpToken, resolveTokenUser, revokeToken } from "../src/mcp/auth.js";
import { getPoolClient } from "../src/db/client.js";

async function seedUser(email: string): Promise<string> {
  const client = await getPoolClient();
  try {
    const res = await client.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id",
      [email]
    );
    return res.rows[0].id;
  } finally {
    client.release();
  }
}

describe("mcp token auth", () => {
  let userId: string;
  let plaintext: string;

  beforeEach(async () => {
    userId = await seedUser(`mcp-auth-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`);
    ({ plaintext } = await createMcpToken(userId, "test-label"));
  });

  afterEach(async () => {
    const client = await getPoolClient();
    try {
      await client.query("DELETE FROM users WHERE id = $1", [userId]);
    } finally {
      client.release();
    }
  });

  test("createMcpToken returns plaintext once and stores hash", async () => {
    assert.match(plaintext, /^[a-f0-9]{64}$/, "token must be 64 hex chars");
    const client = await getPoolClient();
    try {
      const res = await client.query("SELECT label, token_hash FROM mcp_tokens WHERE user_id = $1", [userId]);
      assert.equal(res.rows[0].label, "test-label");
      // 确认存的是哈希不是明文
      assert.notEqual(res.rows[0].token_hash, plaintext, "must store hash not plaintext");
    } finally {
      client.release();
    }
  });

  test("resolveTokenUser returns userId for valid token", async () => {
    const resolved = await resolveTokenUser(plaintext);
    assert.equal(resolved, userId);
  });

  test("resolveTokenUser returns null for unknown token", async () => {
    const resolved = await resolveTokenUser("0".repeat(64));
    assert.equal(resolved, null);
  });

  test("resolveTokenUser returns null after revoke", async () => {
    await revokeToken(userId, plaintext);
    const resolved = await resolveTokenUser(plaintext);
    assert.equal(resolved, null);
  });

  test("resolveTokenUser returns null for malformed token", async () => {
    const resolved = await resolveTokenUser("not-a-valid-token");
    assert.equal(resolved, null);
  });
});
