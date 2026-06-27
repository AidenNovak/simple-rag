import { describe, test, before, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { executeTool, type ToolContext } from "../src/tools/index.js";
import { getPoolClient, closeDb } from "../src/db/client.js";
import { closeRedis } from "../src/jobs/queue.js";

async function seedUserAndNote(email: string, title: string, initialContent: string) {
  const client = await getPoolClient();
  try {
    const u = await client.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id",
      [email]
    );
    const userId = u.rows[0].id;
    const d = await client.query(
      "INSERT INTO documents (user_id, title, kind, source_format, content_md, status) VALUES ($1, $2, 'note', 'md', $3, 'ready') RETURNING id",
      [userId, title, initialContent]
    );
    return { userId, noteId: d.rows[0].id };
  } finally {
    client.release();
  }
}

const baseCtx = (userId: string): ToolContext => ({ userId, creds: {} as any, docIds: null });

describe("append_note tool", () => {
  let owner: { userId: string; noteId: string };
  let intruder: { userId: string; noteId: string };

  beforeEach(async () => {
    owner = await seedUserAndNote(`append-owner-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`, "我的日记", "原有内容");
    intruder = await seedUserAndNote(`append-intr-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`, "别人的笔记", "私有");
  });

  afterEach(async () => {
    const client = await getPoolClient();
    try {
      await client.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [[owner.userId, intruder.userId]]);
    } finally {
      client.release();
    }
  });

  // enqueueIngest 会建立 Redis 长连接；测试结束关闭它，让进程能正常退出。
  after(async () => {
    await closeRedis();
    await closeDb();
  });

  test("appends content to existing note without overwriting", async () => {
    const res = await executeTool("append_note", { note_id: owner.noteId, content: "今天的新想法" }, baseCtx(owner.userId));
    assert.match(res.content, /已向笔记《我的日记》追加/);
    // 验证 DB：原文 + 分隔符 + 新内容
    const client = await getPoolClient();
    try {
      const r = await client.query("SELECT content_md FROM documents WHERE id = $1", [owner.noteId]);
      assert.ok(r.rows[0].content_md.includes("原有内容"), "原文必须保留");
      assert.ok(r.rows[0].content_md.includes("今天的新想法"), "新内容必须追加");
    } finally {
      client.release();
    }
  });

  test("does not leak across tenants (intruder cannot append to owner's note)", async () => {
    const res = await executeTool(
      "append_note",
      { note_id: owner.noteId, content: "恶意追加" },
      baseCtx(intruder.userId)
    );
    assert.match(res.content, /未找到该笔记/);
    // 验证原文未被污染
    const client = await getPoolClient();
    try {
      const r = await client.query("SELECT content_md FROM documents WHERE id = $1", [owner.noteId]);
      assert.equal(r.rows[0].content_md, "原有内容");
      assert.ok(!r.rows[0].content_md.includes("恶意追加"));
    } finally {
      client.release();
    }
  });

  test("returns not-found for nonexistent note_id", async () => {
    const res = await executeTool(
      "append_note",
      { note_id: "00000000-0000-0000-0000-000000000000", content: "x" },
      baseCtx(owner.userId)
    );
    assert.match(res.content, /未找到该笔记/);
  });

  test("appends to an empty note without leading separator", async () => {
    const client = await getPoolClient();
    try {
      await client.query("UPDATE documents SET content_md = '' WHERE id = $1", [owner.noteId]);
    } finally {
      client.release();
    }
    await executeTool("append_note", { note_id: owner.noteId, content: "首条内容" }, baseCtx(owner.userId));
    const client2 = await getPoolClient();
    try {
      const r = await client2.query("SELECT content_md FROM documents WHERE id = $1", [owner.noteId]);
      assert.equal(r.rows[0].content_md, "首条内容", "空笔记追加不应有前导分隔符");
    } finally {
      client2.release();
    }
  });
});
