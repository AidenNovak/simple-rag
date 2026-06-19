import type { FastifyInstance } from "fastify";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../db/client.js";
import { authGuard, requireUser, type AuthedRequest } from "../auth/middleware.js";
import { enqueueIngest } from "../jobs/queue.js";
import { config } from "../config/index.js";

/**
 * 文档路由：
 *   POST   /documents/upload    multipart 上传文件 → 创建 doc → 入队摄入
 *   POST   /documents/note      创建笔记（kind=note，正文直存，立即摄入）
 *   GET    /documents           列表（status 过滤）
 *   GET    /documents/:id       详情（含 contentMd）
 *   PATCH  /documents/:id       更新笔记正文（重新摄入）
 *   DELETE /documents/:id       删除
 *   GET    /documents/:id/status 摄入状态轮询
 */
export async function documentRoutes(app: FastifyInstance) {
  // ---- 上传文件 ----
  app.post("/documents/upload", { preHandler: [authGuard] }, async (req: AuthedRequest, reply) => {
    const user = requireUser(req);
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: "no file" });

    const ext = path.extname(data.filename).slice(1).toLowerCase();
    const allowed = ["pdf", "docx", "doc", "pptx", "xlsx", "xls", "csv", "md", "markdown", "txt", "html", "htm", "epub"];
    if (!allowed.includes(ext)) {
      return reply.code(415).send({ error: `unsupported format: ${ext}` });
    }

    // 存盘
    const fs = await import("node:fs/promises");
    const { randomUUID } = await import("node:crypto");
    const fileId = randomUUID();
    const storeName = `${fileId}.${ext}`;
    const storePath = path.join(config.uploadDir, user.id, storeName);
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    const buf = await data.toBuffer();
    await fs.writeFile(storePath, buf);

    const db = getDb();
    const [doc] = await db
      .insert(schema.documents)
      .values({
        userId: user.id,
        title: data.filename,
        kind: "file",
        sourceFormat: ext,
        filePath: storePath,
        mimeType: data.mimetype,
        sizeBytes: buf.byteLength,
        status: "pending",
      })
      .returning();

    await enqueueIngest({ documentId: doc.id, userId: user.id });
    reply.send({ document: doc });
  });

  // ---- 创建笔记 ----
  app.post("/documents/note", { preHandler: [authGuard] }, async (req: AuthedRequest, reply) => {
    const user = requireUser(req);
    const body = (req.body || {}) as { title?: string; content?: string };
    if (!body.title?.trim() || !body.content?.trim()) {
      return reply.code(400).send({ error: "标题和正文不能为空" });
    }
    const db = getDb();
    const [doc] = await db
      .insert(schema.documents)
      .values({
        userId: user.id,
        title: body.title,
        kind: "note",
        sourceFormat: "md",
        contentMd: body.content,
        status: "pending",
      })
      .returning();
    await enqueueIngest({ documentId: doc.id, userId: user.id });
    reply.send({ document: doc });
  });

  // ---- 列表 ----
  app.get("/documents", { preHandler: [authGuard] }, async (req: AuthedRequest, reply) => {
    const user = requireUser(req);
    const status = (req.query as { status?: string }).status;
    const db = getDb();
    let q = db
      .select({
        id: schema.documents.id,
        title: schema.documents.title,
        kind: schema.documents.kind,
        sourceFormat: schema.documents.sourceFormat,
        status: schema.documents.status,
        sizeBytes: schema.documents.sizeBytes,
        errorMsg: schema.documents.errorMsg,
        createdAt: schema.documents.createdAt,
        updatedAt: schema.documents.updatedAt,
      })
      .from(schema.documents)
      .where(eq(schema.documents.userId, user.id))
      .orderBy(desc(schema.documents.createdAt));
    const rows = await q;
    reply.send({ documents: status ? rows.filter((r) => r.status === status) : rows });
  });

  // ---- 详情 ----
  app.get("/documents/:id", { preHandler: [authGuard] }, async (req: AuthedRequest, reply) => {
    const user = requireUser(req);
    const id = (req.params as { id: string }).id;
    const db = getDb();
    const [doc] = await db
      .select()
      .from(schema.documents)
      .where(and(eq(schema.documents.id, id), eq(schema.documents.userId, user.id)))
      .limit(1);
    if (!doc) return reply.code(404).send({ error: "not found" });
    reply.send({ document: doc });
  });

  // ---- 更新笔记 ----
  app.patch("/documents/:id", { preHandler: [authGuard] }, async (req: AuthedRequest, reply) => {
    const user = requireUser(req);
    const id = (req.params as { id: string }).id;
    const body = (req.body || {}) as { title?: string; content?: string };
    const db = getDb();
    const [doc] = await db
      .select()
      .from(schema.documents)
      .where(and(eq(schema.documents.id, id), eq(schema.documents.userId, user.id)))
      .limit(1);
    if (!doc) return reply.code(404).send({ error: "not found" });
    await db
      .update(schema.documents)
      .set({
        ...(body.title ? { title: body.title } : {}),
        ...(body.content !== undefined ? { contentMd: body.content } : {}),
        status: "pending",
      })
      .where(eq(schema.documents.id, id));
    await enqueueIngest({ documentId: id, userId: user.id });
    reply.send({ ok: true });
  });

  // ---- 删除 ----
  app.delete("/documents/:id", { preHandler: [authGuard] }, async (req: AuthedRequest, reply) => {
    const user = requireUser(req);
    const id = (req.params as { id: string }).id;
    const db = getDb();
    const [doc] = await db
      .delete(schema.documents)
      .where(and(eq(schema.documents.id, id), eq(schema.documents.userId, user.id)))
      .returning();
    if (!doc) return reply.code(404).send({ error: "not found" });
    // 清理本地文件
    if (doc.filePath) {
      const fs = await import("node:fs/promises");
      fs.unlink(doc.filePath).catch(() => {});
    }
    reply.send({ ok: true });
  });

  // ---- 重试摄入（失败/卡住的文档）----
  app.post("/documents/:id/reingest", { preHandler: [authGuard] }, async (req: AuthedRequest, reply) => {
    const user = requireUser(req);
    const id = (req.params as { id: string }).id;
    const db = getDb();
    const [doc] = await db
      .select()
      .from(schema.documents)
      .where(and(eq(schema.documents.id, id), eq(schema.documents.userId, user.id)))
      .limit(1);
    if (!doc) return reply.code(404).send({ error: "not found" });
    // 重置状态，重新入队
    await db.update(schema.documents).set({ status: "pending", errorMsg: null }).where(eq(schema.documents.id, id));
    await enqueueIngest({ documentId: id, userId: user.id });
    reply.send({ ok: true });
  });

  // ---- 下载原始文件 ----
  app.get("/documents/:id/download", { preHandler: [authGuard] }, async (req: AuthedRequest, reply) => {
    const user = requireUser(req);
    const id = (req.params as { id: string }).id;
    const db = getDb();
    const [doc] = await db.select().from(schema.documents)
      .where(and(eq(schema.documents.id, id), eq(schema.documents.userId, user.id))).limit(1);
    if (!doc) return reply.code(404).send({ error: "not found" });
    if (!doc.filePath) return reply.code(400).send({ error: "该文档没有原始文件" });
    const fs = await import("node:fs/promises");
    try {
      const buf = await fs.readFile(doc.filePath);
      reply.header("Content-Type", doc.mimeType || "application/octet-stream");
      reply.header("Content-Disposition", `attachment; filename="${encodeURIComponent(doc.title)}"`);
      reply.send(buf);
    } catch {
      return reply.code(404).send({ error: "文件不存在" });
    }
  });
}
