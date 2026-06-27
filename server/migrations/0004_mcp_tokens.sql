-- MCP server 专用 API token（长驻后端进程用，非浏览器 JWT）
-- 明文 token 仅创建时返回，DB 只存 SHA-256 哈希
CREATE TABLE IF NOT EXISTS mcp_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  label text,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_mcp_tokens_hash
  ON mcp_tokens(token_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_user
  ON mcp_tokens(user_id);
