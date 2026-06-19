import type { FastifyInstance } from "fastify";
import { getPoolClient } from "../db/client.js";
import { authGuard, requireUser, type AuthedRequest } from "../auth/middleware.js";
import { retrieve } from "../rag/retrieve.js";

/**
 * 检索路由：
 *   POST /search  混合检索（向量+关键词），返回 chunk 级结果（不调用 chat）
 *   GET  /search/suggest  文档标题/片段关键词补全（trigram）
 *
 * 用于：搜索框、文档浏览、"查看相关片段"。
 */
export async function searchRoutes(app: FastifyInstance) {
  app.post("/search", { preHandler: [authGuard] }, async (req: AuthedRequest, reply) => {
    const user = requireUser(req);
    const body = (req.body || {}) as { query?: string; topK?: number };
    if (!body.query) return reply.code(400).send({ error: "query required" });

    const creds = { chatApiKeyEnc: user.newapiKeyEnc, chatModel: user.chatModel };
    const results = await retrieve(user.id, body.query, creds, { topK: body.topK ?? 10 });
    reply.send({ results });
  });

  // 文档级关键词补全（标题 + 片段预览），不走 embedding，纯 trigram
  app.get("/search/suggest", { preHandler: [authGuard] }, async (req: AuthedRequest, reply) => {
    const user = requireUser(req);
    const q = ((req.query as { q?: string }).q || "").trim();
    if (!q) return reply.send({ results: [] });

    const client = await getPoolClient();
    try {
      const res = await client.query(
        `SELECT c.id, c.doc_id, c.ordinal, c.text, c.locator, d.title,
                ts_headline('simple', c.text, phraseto_tsquery('simple', $2), 'MaxWords=35') AS snippet,
                similarity(c.text, $2) AS sim
         FROM chunks c JOIN documents d ON d.id = c.doc_id
         WHERE c.user_id = $1 AND c.text % $2
         ORDER BY sim DESC
         LIMIT 10`,
        [user.id, q]
      );
      reply.send({
        results: res.rows.map((r: any) => ({
          chunkId: r.id,
          docId: r.doc_id,
          docTitle: r.title,
          ordinal: r.ordinal,
          snippet: r.snippet || r.text.slice(0, 200),
          similarity: r.sim,
        })),
      });
    } finally {
      client.release();
    }
  });
}
