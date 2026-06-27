import { describe, test, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { executeTool, type ToolContext } from "../src/tools/index.js";
import { getPoolClient, closeDb } from "../src/db/client.js";
import { closeRedis } from "../src/jobs/queue.js";

async function seedUserAndNote(email: string, title: string) {
  const client = await getPoolClient();
  try {
    const u = await client.query("INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id", [email]);
    const userId = u.rows[0].id;
    const d = await client.query(
      "INSERT INTO documents (user_id, title, kind, source_format, content_md, status) VALUES ($1, $2, 'note', 'md', '内容', 'ready') RETURNING id",
      [userId, title]
    );
    return { userId, noteId: d.rows[0].id };
  } finally {
    client.release();
  }
}

const baseCtx = (userId: string): ToolContext => ({ userId, creds: {} as any, docIds: null });

describe("note tags tools", () => {
  let alice: { userId: string; noteId: string };
  let aliceNote2: { userId: string; noteId: string };
  let bob: { userId: string; noteId: string };

  beforeEach(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    alice = await seedUserAndNote(`tag-alice-${stamp}@test.local`, "RAG 笔记");
    aliceNote2 = await seedUserAndNote(`tag-alice2-${stamp}@test.local`, "日常记录");
    bob = await seedUserAndNote(`tag-bob-${stamp}@test.local`, "Bob 的笔记");
  });

  afterEach(async () => {
    const client = await getPoolClient();
    try {
      await client.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [[alice.userId, aliceNote2.userId, bob.userId]]);
    } finally {
      client.release();
    }
  });

  after(async () => {
    await closeRedis();
    await closeDb();
  });

  test("set_note_tags creates tags and links them", async () => {
    const res = await executeTool("set_note_tags", { note_id: alice.noteId, tags: ["工作", "RAG"] }, baseCtx(alice.userId));
    assert.match(res.content, /已为笔记《RAG 笔记》设置标签：工作、RAG/);
  });

  test("set_note_tags replaces tags (not appends)", async () => {
    await executeTool("set_note_tags", { note_id: alice.noteId, tags: ["A", "B"] }, baseCtx(alice.userId));
    await executeTool("set_note_tags", { note_id: alice.noteId, tags: ["C"] }, baseCtx(alice.userId));
    const client = await getPoolClient();
    try {
      const r = await client.query(
        `SELECT t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE nt.note_id = $1`,
        [alice.noteId]
      );
      const names = r.rows.map((x: any) => x.name).sort();
      assert.deepEqual(names, ["C"], "second set should replace, leaving only C");
    } finally {
      client.release();
    }
  });

  test("set_note_tags with empty array clears all tags", async () => {
    await executeTool("set_note_tags", { note_id: alice.noteId, tags: ["X"] }, baseCtx(alice.userId));
    const res = await executeTool("set_note_tags", { note_id: alice.noteId, tags: [] }, baseCtx(alice.userId));
    assert.match(res.content, /已清空笔记/);
  });

  test("set_note_tags does not leak across tenants (bob cannot tag alice's note)", async () => {
    const res = await executeTool("set_note_tags", { note_id: alice.noteId, tags: ["恶意"] }, baseCtx(bob.userId));
    assert.match(res.content, /未找到该笔记/);
  });

  test("search_notes_by_tag with no tags lists all user tags", async () => {
    await executeTool("set_note_tags", { note_id: alice.noteId, tags: ["工作", "RAG"] }, baseCtx(alice.userId));
    const res = await executeTool("search_notes_by_tag", {}, baseCtx(alice.userId));
    assert.match(res.content, /工作/);
    assert.match(res.content, /RAG/);
  });

  test("search_notes_by_tag filters notes by tag (tenant-isolated)", async () => {
    await executeTool("set_note_tags", { note_id: alice.noteId, tags: ["工作"] }, baseCtx(alice.userId));
    // bob 给自己的笔记打同样的标签 "工作"
    await executeTool("set_note_tags", { note_id: bob.noteId, tags: ["工作"] }, baseCtx(bob.userId));
    // alice 搜 "工作" 应只看到自己的笔记，看不到 bob 的
    const res = await executeTool("search_notes_by_tag", { tags: ["工作"] }, baseCtx(alice.userId));
    assert.ok(res.content.includes("RAG 笔记"), "alice should see her own tagged note");
    assert.ok(!res.content.includes("Bob 的笔记"), "alice must NOT see bob's note");
  });
});
