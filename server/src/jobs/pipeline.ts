/**
 * 摄入总管线：抽取 →（OCR 回退）→ 切分 → 嵌入 → 入库。
 *
 * 状态机：pending → extracting → (ocr) → chunking → embedding → ready / failed
 * 每步更新 documents.status，便于前端轮询进度。
 *
 * 全程按系统计费：embedding 走系统级 Embedding API（智谱 embedding-3），
 * 不消耗用户的 chat key。OCR 走系统 GLM_OCR_API_KEY（扫描件是平台资源，
 *   也可后续改为用户透传智谱 key）。
 */
import path from "node:path";
import { eq, and } from "drizzle-orm";
import { getDb, schema, getPoolClient } from "../db/client.js";
import { extractFile } from "../ingest/extract.js";
import { chunkMarkdown } from "../ingest/chunk.js";
import { embedTexts } from "../llm/embed.js";
import { ocrPdf } from "../llm/ocr.js";
import { findUserById } from "../auth/jwt.js";
import { config } from "../config/index.js";
import { logger } from "../config/logger.js";
import type { IngestJob } from "./queue.js";

async function setStatus(documentId: string, status: string, extra?: Record<string, unknown>) {
  const db = getDb();
  await db
    .update(schema.documents)
    .set({ status, ...(extra || {}) })
    .where(eq(schema.documents.id, documentId));
}

export async function ingestDocument(job: IngestJob): Promise<void> {
  const { documentId, userId } = job;
  const log = logger.child({ documentId, userId });
  log.info("ingest start");

  const user = await findUserById(userId);
  if (!user) {
    await setStatus(documentId, "failed", { errorMsg: "user not found" });
    return;
  }

  const db = getDb();
  const [doc] = await db
    .select()
    .from(schema.documents)
    .where(and(eq(schema.documents.id, documentId), eq(schema.documents.userId, userId)))
    .limit(1);
  if (!doc) {
    log.error("document not found");
    return;
  }

  try {
    // ---- 1. 抽取 ----
    await setStatus(documentId, "extracting");
    let md = doc.contentMd || "";
    let locatorKind = "section";

    if (doc.kind === "file" && doc.filePath) {
      const ext = path.extname(doc.filePath).slice(1);
      const result = await extractFile(doc.filePath, ext, doc.mimeType || "");
      md = result.md;
      locatorKind = result.locatorKind || locatorKind;

      // 扫描件 → OCR 回退
      if (result.needsOcr && config.glmOcrKey) {
        await setStatus(documentId, "ocr");
        log.info("detected scanned pdf, running GLM-OCR");
        const fs = await import("node:fs/promises");
        const pdfBytes = await fs.readFile(doc.filePath);
        const ocr = await ocrPdf(pdfBytes, doc.title.replace(/\s+/g, "_"));
        md = ocr.md;
        log.info({ chunks: ocr.chunks, failed: ocr.failed }, "ocr done");
      }
    }

    if (!md.trim()) {
      await setStatus(documentId, "failed", { errorMsg: "empty content after extraction" });
      return;
    }

    // 保存提取的文本到 contentMd（让 DocPreview 能显示）
    if (doc.kind === "file") {
      await db.update(schema.documents).set({ contentMd: md.slice(0, 50000) }).where(eq(schema.documents.id, documentId));
    }

    // ---- 2. 切分 ----
    await setStatus(documentId, "chunking");
    const chunkOuts = chunkMarkdown(md, { maxChars: 1200, overlap: 150 });
    log.info({ chunks: chunkOuts.length }, "chunked");

    // ---- 3. 嵌入（系统级智谱 embedding-3）----
    await setStatus(documentId, "embedding");
    const texts = chunkOuts.map((c) => c.text);
    const { vectors, usage } = await embedTexts(texts);
    log.info({ usage }, "embedded");

    // ---- 4. 入库（chunk + embedding 列）----
    const client = await getPoolClient();
    try {
      await client.query("BEGIN");
      // 先删旧 chunk（重摄入场景）
      await client.query("DELETE FROM chunks WHERE doc_id = $1", [documentId]);
      // 批量插入 chunk 行，返回 id，再逐条 UPDATE embedding 列
      const inserted: { id: string; ordinal: number }[] = [];
      for (let i = 0; i < chunkOuts.length; i++) {
        const c = chunkOuts[i];
        const r = await client.query(
          `INSERT INTO chunks (user_id, doc_id, ordinal, text, locator, token_count)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [userId, documentId, i, c.text, JSON.stringify(c.locator), c.tokenCount]
        );
        inserted.push({ id: r.rows[0].id, ordinal: i });
      }
      // 写 embedding（pgvector 文本表示 '[0.1,0.2,...]'）
      for (const ins of inserted) {
        const vec = vectors[ins.ordinal];
        if (!vec) continue;
        await client.query(`UPDATE chunks SET embedding = $1::vector WHERE id = $2`, [
          `[${vec.join(",")}]`,
          ins.id,
        ]);
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    await setStatus(documentId, "ready", {
      errorMsg: null,
      meta: { ...(doc.meta || {}), locatorKind, chunks: chunkOuts.length, embedUsage: usage },
    });
    log.info("ingest ready");
  } catch (e) {
    log.error({ err: (e as Error).message }, "ingest failed");
    await setStatus(documentId, "failed", { errorMsg: (e as Error).message });
  }
}
