import dotenv from "dotenv";
dotenv.config();

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`[config] missing env: ${name}`);
  return v;
}

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 8787),
  corsOrigin: (process.env.CORS_ORIGIN || "http://localhost:5173").split(",").map((s) => s.trim()),

  databaseUrl: req("DATABASE_URL"),
  redisUrl: req("REDIS_URL", "redis://127.0.0.1:6379/0"),

  jwtSecret: req("JWT_SECRET"),
  jwtTtl: process.env.JWT_TTL || "7d",

  // ---- 双端点配置 ----
  // Chat 走 DeepSeek 官方（reasoning 模型，支持 function calling）
  chatBaseUrl: req("CHAT_BASE_URL", "https://api.deepseek.com/v1"),
  chatApiKey: req("CHAT_API_KEY", ""),
  chatModel: process.env.CHAT_MODEL || "deepseek-v4-pro",

  // Embedding 走智谱 embedding-3（1024 维，中文强）
  embeddingBaseUrl: req("EMBEDDING_BASE_URL", "https://open.bigmodel.cn/api/paas/v4"),
  embeddingApiKey: req("EMBEDDING_API_KEY", ""),
  embeddingModel: process.env.EMBEDDING_MODEL || "embedding-3",
  embeddingDim: Number(process.env.EMBEDDING_DIM || 1024),

  // 扫描件 OCR 走智谱直连（GLM-OCR layout_parsing）
  glmOcrKey: process.env.GLM_OCR_API_KEY || "",
  glmOcrModel: process.env.GLM_OCR_MODEL || "glm-ocr",

  uploadDir: process.env.UPLOAD_DIR || "./data/uploads",
  chunkDir: process.env.CHUNK_DIR || "./data/chunks",

  embedConcurrency: Number(process.env.EMBED_CONCURRENCY || 5),
  ocrChunkPages: Number(process.env.OCR_CHUNK_PAGES || 100),

  // 加密用户 key 用的对称密钥（32 字节 hex/base64）。生产必改。
  encKey: req("ENC_KEY", "dev-only-please-change-32bytes-long!!"),

  // ---- 可调参数（集中管理，消除散落各文件的魔法数字）----
  tuning: {
    agentMaxIters: Number(process.env.AGENT_MAX_ITERS || 10),
    agentMaxTokens: Number(process.env.AGENT_MAX_TOKENS || 3000),
    compressRecentKeep: Number(process.env.COMPRESS_RECENT_KEEP || 8),
    compressThreshold: Number(process.env.COMPRESS_THRESHOLD || 0.85),
    contextReservedOutput: Number(process.env.CONTEXT_RESERVED_OUTPUT || 4000),
    contextToolReserve: Number(process.env.CONTEXT_TOOL_RESERVE || 2000),
    contextMinRecentTurns: Number(process.env.CONTEXT_MIN_RECENT_TURNS || 4),
    embedBatchSize: Number(process.env.EMBED_BATCH_SIZE || 16),
    retrieveTopK: Number(process.env.RETRIEVE_TOP_K || 5),
    retrieveVectorTopK: Number(process.env.RETRIEVE_VECTOR_TOP_K || 20),
    retrieveKeywordTopK: Number(process.env.RETRIEVE_KEYWORD_TOP_K || 20),
    rrfK: Number(process.env.RRF_K || 60),
    chunkMaxChars: Number(process.env.CHUNK_MAX_CHARS || 1200),
    chunkOverlap: Number(process.env.CHUNK_OVERLAP || 150),
    questionMaxLen: Number(process.env.QUESTION_MAX_LEN || 8000),
    rateLimitPerMin: Number(process.env.RATE_LIMIT || 200),
    /** 每轮对话内 web_search + web_scrape 总调用上限，超过则拒绝执行并提示模型收尾 */
    maxWebSearchPerTurn: Number(process.env.MAX_WEB_SEARCH || 3),
  },
};

export type Config = typeof config;
