-- 0002_byok.sql — Bring Your Own Key: 用户自定义 chat key + endpoint
-- 新增 chat_api_key_enc（加密的用户 chat key）和 chat_base_url（自定义端点）

ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_api_key_enc text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_base_url text;

-- 迁移旧数据：把 newapi_key_enc 的值复制到 chat_api_key_enc（向后兼容）
UPDATE users SET chat_api_key_enc = newapi_key_enc WHERE chat_api_key_enc IS NULL AND newapi_key_enc IS NOT NULL;
