-- 0003_scope.sql — 会话级文档范围选择
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS scope_doc_ids jsonb;
