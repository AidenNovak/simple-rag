/**
 * 混合检索：向量召回（语义）+ trigram 关键词召回（精确/术语）→ RRF 融合。
 *
 * 隔离：所有查询 WHERE user_id = $1，绝不跨租户。
 *
 * pgvector：ORDER BY embedding <=> $vec 命中 ivfflat 索引。
 * pg_trgm：similarity(text, query) > 阈值 或 % 操作符，命中 GIN 索引。
 *
 * RRF（Reciprocal Rank Fusion）：score = Σ 1/(k+rank_i)，无需分数归一化，
 *   对"向量与关键词分数量纲不同"鲁棒，是混合检索最稳的工程做法。
 */
import { getPoolClient } from "../db/client.js";
import { embedOne } from "../llm/embed.js";
import type { UserChatCreds } from "../llm/client.js";

export interface RetrievedChunk {
  chunkId: string;
  docId: string;
  docTitle: string;
  ordinal: number;
  text: string;
  locator: Record<string, string | number> | null;
  /** 来源：vector | keyword | both */
  source: string;
  score: number;
}

import { config } from "../config/index.js";
import { logger } from "../config/logger.js";

export interface RetrieveOpts {
  topK?: number;
  vectorTopK?: number;
  keywordTopK?: number;
  similarityThreshold?: number;
  /** 限定检索的文档 ID 列表。null/undefined/空 = 全部文档。 */
  docIds?: string[] | null;
}

/** 混合检索。query 为用户问题或关键词。 */
export async function retrieve(
  userId: string,
  query: string,
  creds: UserChatCreds,
  opts: RetrieveOpts = {}
): Promise<RetrievedChunk[]> {
  const t = config.tuning;
  const topK = opts.topK ?? t.retrieveTopK;
  const vTop = opts.vectorTopK ?? t.retrieveVectorTopK;
  const kTop = opts.keywordTopK ?? t.retrieveKeywordTopK;
  const thr = opts.similarityThreshold ?? 0.1;

  // 文档范围过滤
  const hasScope = opts.docIds && opts.docIds.length > 0;
  const scopeSQL = hasScope ? `AND c.doc_id = ANY($4::uuid[])` : "";

  const vec = await embedOne(query);
  const client = await getPoolClient();
  try {
    // 并行两路召回
    const [vRes, kRes] = await Promise.all([
      // 向量召回
      client.query<{
        id: string; doc_id: string; ordinal: number; text: string;
        locator: any; title: string;
      }>(
        `SELECT c.id, c.doc_id, c.ordinal, c.text, c.locator, d.title
         FROM chunks c JOIN documents d ON d.id = c.doc_id
         WHERE c.user_id = $1 AND c.embedding IS NOT NULL ${scopeSQL}
         ORDER BY c.embedding <=> $2::vector
         LIMIT $3`,
        hasScope ? [userId, `[${vec.join(",")}]`, vTop, opts.docIds] : [userId, `[${vec.join(",")}]`, vTop]
      ),
      // 关键词召回
      client.query<{
        id: string; doc_id: string; ordinal: number; text: string;
        locator: any; title: string; sim: number;
      }>(
        `SELECT c.id, c.doc_id, c.ordinal, c.text, c.locator, d.title,
                similarity(c.text, $2) AS sim
         FROM chunks c JOIN documents d ON d.id = c.doc_id
         WHERE c.user_id = $1 AND c.text % $2 ${scopeSQL}
         ORDER BY sim DESC
         LIMIT $3`,
        hasScope ? [userId, query, kTop, opts.docIds] : [userId, query, kTop]
      ),
    ]);

    // RRF 融合
    const ranks = new Map<string, { chunk: Omit<RetrievedChunk, "score" | "source">; rrf: number; sources: Set<string> }>();
    const bump = (id: string, rank0: number, src: string, base: Omit<RetrievedChunk, "score" | "source">) => {
      let entry = ranks.get(id);
      if (!entry) {
        entry = { chunk: base, rrf: 0, sources: new Set() };
        ranks.set(id, entry);
      }
      entry.rrf += 1 / (config.tuning.rrfK + rank0 + 1);
      entry.sources.add(src);
    };

    vRes.rows.forEach((r, i) =>
      bump(r.id, i, "vector", {
        chunkId: r.id, docId: r.doc_id, docTitle: r.title,
        ordinal: r.ordinal, text: r.text, locator: normalizeLocator(r.locator),
      })
    );
    kRes.rows.forEach((r, i) =>
      bump(r.id, i, "keyword", {
        chunkId: r.id, docId: r.doc_id, docTitle: r.title,
        ordinal: r.ordinal, text: r.text, locator: normalizeLocator(r.locator),
      })
    );

    const merged = [...ranks.values()]
      .map((e) => ({
        ...e.chunk,
        score: e.rrf,
        source: e.sources.size > 1 ? "both" : ([...e.sources][0] || "unknown"),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    logger.debug({ userId, query: query.slice(0, 40), vectorHits: vRes.rows.length, keywordHits: kRes.rows.length, merged: merged.length }, "retrieve done");
    return merged;
  } finally {
    client.release();
  }
}

function normalizeLocator(raw: unknown): Record<string, string | number> | null {
  if (!raw || typeof raw !== "object") return null;
  try {
    return raw as Record<string, string | number>;
  } catch {
    return null;
  }
}
