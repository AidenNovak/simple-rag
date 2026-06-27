import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { getPoolClient } from "../src/db/client.js";

describe("mcp_tokens schema", () => {
  test("table exists with required columns", async () => {
    const client = await getPoolClient();
    try {
      const res = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'mcp_tokens' ORDER BY ordinal_position
      `);
      const cols = res.rows.map((r: any) => r.column_name);
      assert.ok(cols.includes("token_hash"), "missing token_hash");
      assert.ok(cols.includes("user_id"), "missing user_id");
      assert.ok(cols.includes("revoked_at"), "missing revoked_at");
    } finally {
      client.release();
    }
  });
});
