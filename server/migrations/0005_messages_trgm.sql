-- 对话历史检索：messages.content 加 pg_trgm GIN 索引
-- 供 search_conversations 工具用 similarity() / % 操作符做模糊匹配（多租户隔离）
CREATE INDEX IF NOT EXISTS msgs_content_trgm_idx
  ON messages USING gin (content gin_trgm_ops);
CREATE INDEX IF NOT EXISTS msgs_user_created_idx
  ON messages (user_id, created_at DESC);
