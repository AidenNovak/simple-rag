import {
  pgTable, uuid, text, timestamp, integer, jsonb, index, uniqueIndex,
} from "drizzle-orm/pg-core";

// pgvector 的 vector(N) 列类型由 migrations/0001_init.sql 用原生 SQL 建列 +
// ivfflat 索引。Drizzle 不内置 vector 类型，故 schema 中不声明该列；
// 检索 SQL（rag/retrieve.ts）直接 SELECT embedding 字段。

/**
 * 多租户个人 RAG 知识库 schema
 *
 * 隔离原则：每张业务表都带 user_id；所有查询经 Repository 层强制 WHERE user_id 过滤。
 * 向量列使用 pgvector，类型为 vector(1024)，需在迁移 SQL 中用原生 SQL 建列。
 * 全文关键词检索使用 pg_trgm（通用、不分语言、中文友好）。
 */

// ---- 用户 ----
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    // BYOK: 用户自定义 Chat 配置（加密 key + 自定义 endpoint）
    chatApiKeyEnc: text("chat_api_key_enc"),
    chatBaseUrl: text("chat_base_url"),
    chatModel: text("chat_model").default("deepseek-v4-pro"),
    // 兼容旧字段（迁移期保留）
    newapiKeyEnc: text("newapi_key_enc"),
    embeddingModel: text("embedding_model").default("embedding-3"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ emailIdx: uniqueIndex("users_email_idx").on(t.email) })
);

// ---- 文档（用户的文件 / 笔记）----
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    // title: 文件名 or 笔记标题
    title: text("title").notNull(),
    // kind: file | note
    kind: text("kind").notNull().default("file"),
    // 摄入来源格式：pdf|word|pptx|xlsx|md|txt|html|epub|image
    sourceFormat: text("source_format"),
    // 原始文件存储路径（file 类）
    filePath: text("file_path"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    // 笔记类直接存 markdown 正文
    contentMd: text("content_md"),
    // 摄入状态：pending|extracting|chunking|embedding|ready|failed
    status: text("status").notNull().default("pending"),
    errorMsg: text("error_msg"),
    // 文档级元数据（页数、作者、来源 url 等）
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userCreatedIdx: index("docs_user_created_idx").on(t.userId, t.createdAt),
    userTitleIdx: index("docs_user_title_trgm_idx").using("gin", t.title),
  })
);

// ---- chunk（检索最小单元）----
export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    docId: uuid("doc_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    // chunk 内文本（已规范化）
    text: text("text").notNull(),
    // 定位信息：页码/幻灯片号/行号 等
    locator: jsonb("locator"),
    // token 数（粗估，用于计费与截断）
    tokenCount: integer("token_count"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    docIdx: index("chunks_doc_idx").on(t.docId),
    userIdx: index("chunks_user_idx").on(t.userId),
    // trigram 全文检索
    textTrgmIdx: index("chunks_text_trgm_idx").using("gin", t.text),
  })
);

// 向量列单独由原生 SQL 建（pgvector 类型 drizzle 不内置）。
// 见 migrations/0001_init.sql 的 chunks.embedding 列 + ivfflat 索引。

// ---- 对话会话与消息 ----
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title"),
    // 会话级文档范围：选中的 docId 列表。null = 全部文档。
    scopeDocIds: jsonb("scope_doc_ids"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ userCreatedIdx: index("conv_user_created_idx").on(t.userId, t.createdAt) })
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant | system
    content: text("content").notNull(),
    // 引用的 chunk id 列表 + 摘要，用于"带引用"展示
    citations: jsonb("citations"),
    // 本次回答的 token 用量（prompt/completion/total），来自 chat completion 响应
    usage: jsonb("usage"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ convIdx: index("msg_conv_idx").on(t.conversationId, t.createdAt) })
);

// ---- MCP API token（三大 harness 后端进程用，非浏览器 JWT）----
// 明文 token 仅创建时返回一次；DB 只存 SHA-256 哈希。
// 用于把外部 agent（Claude Code/Codex/Cursor）绑定到某个 user_id。
export const mcpTokens = pgTable(
  "mcp_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    label: text("label"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({
    hashIdx: index("idx_mcp_tokens_hash").on(t.tokenHash),
    userIdx: index("idx_mcp_tokens_user").on(t.userId),
  })
);

export type McpToken = typeof mcpTokens.$inferSelect;

// ---- 笔记标签（多对多）----
// tags: 按 user_id 隔离的标签字典；note_tags: 笔记↔标签关联。
export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userUnique: uniqueIndex("tags_user_name_uniq").on(t.userId, t.name),
    userIdx: index("idx_tags_user").on(t.userId),
  })
);

export const noteTags = pgTable(
  "note_tags",
  {
    noteId: uuid("note_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: uniqueIndex("note_tags_pk").on(t.noteId, t.tagId),
    tagIdx: index("idx_note_tags_tag").on(t.tagId),
  })
);

export type Tag = typeof tags.$inferSelect;

export type User = typeof users.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Chunk = typeof chunks.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
