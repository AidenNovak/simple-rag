-- 0001_init.sql — private-kb 初始 schema
-- 依赖扩展：vector (pgvector) / pg_trgm / uuid-ossp
-- docker-compose 启动时已自动创建扩展；这里幂等再 CREATE 一次。

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ===== users =====
CREATE TABLE IF NOT EXISTS users (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           text NOT NULL,
  password_hash   text NOT NULL,
  newapi_key_enc  text,
  chat_model      text DEFAULT 'deepseek-v4-pro',
  embedding_model text DEFAULT 'embedding-3',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users (email);

-- ===== documents =====
CREATE TABLE IF NOT EXISTS documents (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         text NOT NULL,
  kind          text NOT NULL DEFAULT 'file',
  source_format text,
  file_path     text,
  mime_type     text,
  size_bytes    integer,
  content_md    text,
  status        text NOT NULL DEFAULT 'pending',
  error_msg     text,
  meta          jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS docs_user_created_idx ON documents (user_id, created_at DESC);
-- 标题全文（trigram，不分语言，中文友好）
CREATE INDEX IF NOT EXISTS docs_user_title_trgm_idx ON documents USING gin (title gin_trgm_ops);

-- ===== chunks =====
CREATE TABLE IF NOT EXISTS chunks (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doc_id      uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  ordinal     integer NOT NULL,
  text        text NOT NULL,
  locator     jsonb,
  token_count integer,
  -- pgvector 列：维度与 embedding 模型一致（embedding-3 默认 1024）
  embedding   vector(1024),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chunks_doc_idx  ON chunks (doc_id);
CREATE INDEX IF NOT EXISTS chunks_user_idx ON chunks (user_id);
-- 正文全文（trigram）
CREATE INDEX IF NOT EXISTS chunks_text_trgm_idx ON chunks USING gin (text gin_trgm_ops);
-- 向量检索索引：ivfflat，lists≈sqrt(行数)；个人库 <10w chunk，lists=100 足够。
-- 重要：向量检索 SQL 必须 ORDER BY embedding <=> $1 才会命中此索引。
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
  ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ===== conversations / messages =====
CREATE TABLE IF NOT EXISTS conversations (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conv_user_created_idx ON conversations (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            text NOT NULL,
  content         text NOT NULL,
  citations       jsonb,
  usage           jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS msg_conv_idx ON messages (conversation_id, created_at);

-- updated_at 触发器
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS documents_touch ON documents;
CREATE TRIGGER documents_touch BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
