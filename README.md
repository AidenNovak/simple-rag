# simple-rag — 最简洁的 RAG 学习系统

`v0.1` · 一个从零搭建的生产级 RAG 知识库，主打**简洁可读、易于学习**。涵盖多租户、文档上传、笔记、带引用问答、Agent 工具调用、网络搜索、真流式渲染——每一步都可在源码中追踪。用户自带 Chat API Key（BYOK，默认 DeepSeek），向量检索走 pgvector，扫描件 OCR 走智谱 GLM-OCR。

> 适合想理解 RAG 全链路（摄入 → 切分 → 嵌入 → 检索 → Agent → 流式）的开发者阅读与二次开发。

## TL;DR

```bash
cp .env.example .env            # 填 CHAT / EMBEDDING / GLM_OCR / TAVILY / JWT / ENC
docker compose up -d            # Postgres(pgvector) + Redis
npm install
npm run db:migrate              # 建 schema + 扩展
npm run dev                     # API :8787
npm run dev:worker              # 摄入 worker（另一终端）
npm run web:dev                 # 前端 :5173
```

打开 http://localhost:5173 → 注册 → **设置页绑定你的 Chat API Key** → 上传文档 → 提问。

## 架构

```text
浏览器 (web/dist, :5173 / 生产由 Fastify 托管)
        │  JWT
        ▼
Fastify API (:8787)
  ├─ auth        注册/登录/绑定 Key
  ├─ documents   上传 / 笔记 / 列表 / 删除 / 重新摄入
  ├─ chat        问答（带引用）/ 流式 SSE（真流式）
  ├─ export      笔记导出 PDF / DOCX
  └─ search      混合检索（RRF）
        │
        ├──► Postgres + pgvector + pg_trgm   (知识库 / 多租户隔离)
        ├──► Redis                            (摄入队列)
        ├──► Chat LLM (OpenAI 兼容, 默认 DeepSeek)   (按用户 Key 计费)
        │       └─ deepseek-v4-pro / deepseek-v4-flash
        ├──► Embedding (智谱 embedding-3, 1024 维)   (系统级资源)
        ├──► Web Search (Tavily)                     (用户可开关, 每轮 ≤3 次)
        └── [扫描件] GLM-OCR (智谱直连, layout_parsing)

Ingest Worker (独立进程, npm run dev:worker)
  Redis BLPOP → 抽取 → (OCR) → 切分 → 嵌入 → pgvector
```

## 核心特性

- **Agent 工具调用**：ReAct 模式，13 个工具（知识库检索 / 关键词检索 / 文档管理 / 笔记 CRUD / 获取时间 / 网络搜索 / 网页抓取 / finish 终止）。模型自主决定调用顺序。
- **真流式输出**：SSE 推送，思考过程（reasoning）逐字显示，最终答案边生成边渲染（markstream-react 增量 Markdown + KaTeX）。
- **活动时间轴**：思考 / 工具调用 / 网络搜索按时序竖向排列，不同颜色区分（思考紫 / 工具绿 / 搜索蓝），可展开看详情；完成后折叠为摘要。
- **网络搜索**：Tavily 驱动，前端「联网」开关控制，每轮对话上限 3 次（防过度联网）。
- **带引用问答**：答案内嵌 `[n]` 角标（蓝色），底部引用 chip 可点击预览原文。
- **长上下文管理**：token 预算感知，超阈值自动压缩历史（保留近期对话 + 降级工具结果）。
- **对话级文档范围**：每个对话可限定检索的文档子集。
- **笔记系统**：CRUD + Markdown 渲染 + 导出（PDF / DOCX）。
- **全格式文档**：PDF（含扫描件 OCR 回退）/ Word / PPT / XLSX / MD / HTML / EPUB。

## 文件索引

| 路径 | 作用 |
|------|------|
| `server/src/index.ts` | API 入口（Fastify 装配 + 迁移 + 启动） |
| `server/src/config/` | 环境配置 / db client / crypto(AES-GCM) / logger |
| `server/src/db/schema.ts` | Drizzle schema（users/documents/chunks/conversations/messages） |
| `server/migrations/` | `0001_init`(建表+pgvector) / `0002_byok`(BYOK) / `0003_scope`(对话文档范围) |
| `server/src/llm/` | client(BYOK 解析) / embed(智谱) / chat / **ocr(GLM-OCR)** / context(预算) / sanitize |
| `server/src/ingest/` | extract(多格式) / chunk(切分) |
| `server/src/jobs/` | queue(Redis) / pipeline(摄入编排) / worker |
| `server/src/rag/` | retrieve(向量+关键词 RRF) / **agent(ReAct 循环 + 流式 + 工具)** |
| `server/src/tools/` | 13 个工具定义 + 执行（检索 / 笔记 / 时间 / 网络搜索 / finish） |
| `server/src/auth/` | jwt / middleware |
| `server/src/routes/` | auth / documents / chat / search / **export** |
| `web/src/` | Vite + React 前端（Chat 主界面 / 文档 / 笔记 / 设置） |

## 计费模型

- 每个用户在「设置」绑定自己的 Chat API Key（AES-256-GCM 加密入库），默认端点 DeepSeek 官方，可自定义 OpenAI 兼容端点。
- 所有 `chat` 调用经该 Key 走对应端点 —— **按用户 Key 计量计费**，无需自建计费层。
- 未绑定 Key 时回退系统兜底 Key（仅开发/兜底，生产建议置空禁用）。
- `embedding`（智谱 embedding-3）与扫描件 `OCR`（GLM-OCR）走系统级 Key，是平台资源，不消耗用户的 chat key。

## 支持格式

| 格式 | 抽取方式 |
|------|----------|
| PDF（文本层） | pdf-parse |
| PDF（扫描件） | 自动检测 → GLM-OCR 回退 |
| Word (.docx) | mammoth → HTML → Markdown |
| PPTX | pptxtojson |
| XLSX/CSV | SheetJS → 每表 Markdown 表 |
| Markdown/TXT | 直读 |
| HTML | turndown |
| EPUB | epub2 → turndown |

## 常用操作

```bash
# 重新摄入某文档（重跑 pipeline）
# PATCH /api/documents/:id 触发，或直接 DELETE chunks + 入队

# 查看摄入 worker 日志
npm run dev:worker

# 生成新迁移（改 schema 后）
npm run db:generate

# 生产构建 + 单进程托管前端
npm run build && npm run web:build
NODE_ENV=production npm start   # 同时托管 web/dist

# 类型检查
npm run typecheck
```

## 隔离与安全

- **多租户隔离**：每张业务表带 `user_id`，Repository 层所有查询强制 `WHERE user_id = $1`，绝不跨租户。向量检索与关键词检索均带租户过滤。
- 用户 Key 用 `ENC_KEY` 派生的 AES-256-GCM 加密存储。
- JWT (HS256) 签名，默认 7 天。
- 生产务必改 `JWT_SECRET` 与 `ENC_KEY`。

## 后期优化路线

- [ ] Reranker：BGE-reranker 对召回结果二次精排
- [ ] 树形索引：长报告类文档接入 PageIndex 做无向量召回
- [ ] Hybrid 检索加分：BM25 替代 trigram
- [ ] 计费看板：聚合 chat 用量按用户展示
