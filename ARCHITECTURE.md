# Architecture — simple-rag

> 本文档是**结构地图**，描述系统分层、跨层契约与不变量。coding agent 修改代码前必读。
> 分层维护指南见 `AGENTS.md`（全局）、`server/AGENTS.md`、`web/AGENTS.md`。

## 系统全景

两进程模型，共享 PostgreSQL + Redis：

```
┌─────────────────────────────────────────────────────────┐
│  API 进程 (index.ts, :8787)                              │
│  Fastify → auth → routes → services/agent → DB           │
│  生产额外托管 web/dist 静态文件                            │
├─────────────────────────────────────────────────────────┤
│  Worker 进程 (jobs/worker.ts)                            │
│  Redis BRPOP → pipeline(抽取→OCR→切分→嵌入) → DB          │
└─────────────────────────────────────────────────────────┘
         │                          │
         ▼                          ▼
   PostgreSQL + pgvector        Redis (队列)
   (知识库 / 多租户)            (ingest:queue / inflight)
         │
   ┌─────┴──────────┬───────────────┬──────────────┐
   ▼                ▼               ▼              ▼
 Chat LLM        Embedding       Web Search     OCR
 (DeepSeek BYOK)  (智谱系统级)    (Tavily 可开关)  (智谱系统级)
```

**双端点架构**：Chat 走用户 BYOK key（默认 DeepSeek），Embedding/OCR 走系统级 key（智谱）。两者绝不混用——这是 BYOK 的根基。

## 目录树与职责

```
private-kb/
├── server/
│   ├── src/
│   │   ├── index.ts          # API 入口：迁移→Fastify 装配→路由→静态托管
│   │   ├── errors.ts         # AppError 层级 → HTTP 状态映射（全局错误处理唯一入口）
│   │   ├── config/           # 配置单例 / AES-GCM 加密 / pino 日志 / 重试
│   │   │   ├── index.ts      #   config 对象 + tuning 调参集中地
│   │   │   ├── crypto.ts     #   encrypt/decrypt（用户 key 唯一加解密路径）
│   │   │   ├── logger.ts     #   pino 实例
│   │   │   └── retry.ts      #   withRetry 指数退避
│   │   ├── db/               # Drizzle client / schema / 迁移
│   │   │   ├── client.ts     #   getDb()(Drizzle) + getPoolClient()(原生SQL)
│   │   │   ├── schema.ts     #   表定义（⚠️ 不含 embedding vector 列）
│   │   │   └── migrate.ts    #   自研极简迁移器（幂等，启动时执行）
│   │   ├── auth/             # JWT 手写 + 中间件
│   │   │   ├── jwt.ts        #   HS256 签发/验证 + 用户仓库函数
│   │   │   └── middleware.ts  #   authGuard → req.user + requireUser
│   │   ├── routes/           # Fastify 路由（transport 层，不含业务逻辑）
│   │   │   ├── auth.ts       #   注册/登录/BYOK 绑定
│   │   │   ├── documents.ts  #   上传/笔记/列表/删除/重新摄入/下载
│   │   │   ├── chat.ts       #   问答（ask + stream SSE）
│   │   │   ├── search.ts     #   混合检索（向量+关键词 RRF）
│   │   │   └── export.ts     #   笔记导出 PDF/DOCX
│   │   ├── services/
│   │   │   └── conversation.ts # 对话/消息仓库（唯一 service 层）
│   │   ├── rag/
│   │   │   ├── agent.ts      # ReAct 循环 + 真流式 + StreamingAnswerExtractor
│   │   │   └── retrieve.ts   # 向量+关键词 RRF 混合检索
│   │   ├── tools/
│   │   │   └── index.ts      # 13 工具定义+执行+getToolDefs 过滤
│   │   ├── llm/
│   │   │   ├── client.ts     #   BYOK 解析（creds→apiKey/model/baseUrl）
│   │   │   ├── embed.ts      #   智谱 embedding（原生 fetch，非 SDK）
│   │   │   ├── ocr.ts        #   GLM-OCR（智谱原生 layout_parsing）
│   │   │   ├── context.ts    #   token 预算 + 上下文构建
│   │   │   ├── compress.ts   #   历史压缩（降级+LLM 摘要两阶段）
│   │   │   ├── sanitize.ts   #   DeepSeek 输出清洗
│   │   │   └── chat.ts       #   标题生成/后续建议
│   │   ├── ingest/
│   │   │   ├── extract.ts    #   多格式抽取（策略模式 switch）
│   │   │   └── chunk.ts      #   Markdown 切分 + locator 解析
│   │   └── jobs/
│   │       ├── queue.ts      #   Redis 队列（BLPOP+inflight+ack）
│   │       ├── pipeline.ts   #   摄入编排状态机
│   │       └── worker.ts     #   独立消费进程
│   ├── migrations/           # 0001_init / 0002_byok / 0003_scope（幂等 SQL）
│   └── test/                 # context / concurrent / streaming-extractor 单测
├── web/
│   └── src/
│       ├── main.tsx          # React 挂载 + ToastProvider
│       ├── App.tsx           # 路由（useState View）+ 侧栏 + auth 状态
│       ├── api.ts            # fetch 封装 + JWT + 401 logout
│       ├── Icons.tsx         # Lucide 风格 SVG 图标
│       ├── styles.css        # 全局暗色主题（CSS 变量 + markstream 覆盖）
│       ├── screens/          # Auth / Chat / Documents / Notes / Search / Settings
│       └── components/       # Toast / DocPreview / NotePanel
├── deploy/                   # nginx.conf（示例域名）+ backup-db.sh
├── Dockerfile                # 多阶段构建（web-builder → app）
├── docker-compose.yml        # 本地开发（PG kb:kb）
├── docker-compose.prod.yml   # 生产（占位符，需 env 注入密码）
└── .env.example              # 环境变量模板
```

## 请求生命周期

```
HTTP 请求
  → Fastify onRequest: 限流（in-process Map，auth/anon 分桶）
  → preHandler: authGuard → verifyJwt → findUserById → req.user
  → handler: requireUser(req) → 构建 creds → 调 service/agent
  → service/agent: DB 查询（WHERE user_id）/ LLM 调用 / 工具执行
  → reply: { error } 或业务 JSON
  → 异常: AppError 子类 → 全局 handler 映射 HTTP 状态（5xx 不泄漏内部信息）
```

## 两条数据主线

### 主线 A：文档摄入
```
用户上传 → documents.ts（写文件+DB row status=pending）
  → enqueueIngest（Redis LPUSH）
  → worker BRPOP → pipeline:
      extracting（extract.ts 按格式抽取）
      → ocr?（扫描件 → ocr.ts GLM-OCR）
      → chunking（chunk.ts 切分+locator）
      → embedding（embed.ts 批量 embed）
      → INSERT chunks + embedding（原生 SQL 事务）
      → status=ready
  → 前端 3s 轮询 documents.status
```

### 主线 B：问答
```
用户提问 → chat.ts /chat/stream
  → 构建 creds（BYOK）+ 加载历史 + 会话文档范围
  → agentAnswerStream（ReAct 循环）:
      stream:true 调 LLM
      → reasoning_content 增量 yield
      → tool_calls 累积 → 执行工具 → yield toolCalls
      → finish 工具 → StreamingAnswerExtractor 增量 yield delta
      → 超时/上限 → 兜底收尾
  → SSE 推送（15s 心跳 + X-Accel-Buffering:no）
  → 前端 Chat.tsx 消费（150ms 节流 → activities 时间轴 + 答案渲染）
  → done 事件 → 持久化 message
```

## 跨层契约表（⚠️ 牵一发动全身）

改左列任一项，必须同步右列所有方，否则后果如末列。

| 契约 | 产出方 | 消费方 | 破坏后果 |
|------|--------|--------|----------|
| `documents.status` 枚举 | `pipeline.ts` 写 | `Documents.tsx` STATUS_LABEL + 轮询谓词 | 前端显示未知状态/轮询不停 |
| locator 注释 `<!-- k=v -->` | `extract.ts` 写 | `chunk.ts` parseLocator 读 → `chunks.locator` → `Citation.locator` → 前端渲染 | 引用定位信息丢失 |
| `StreamEvent` 类型 | `agent.ts` yield | `chat.ts` SSE 转发 + `Chat.tsx` switch 消费 | 前端事件处理崩溃/丢数据 |
| `EMBEDDING_DIM` | `config` env | pgvector 列定义(migration) + `embed.ts` 请求体 | 维度不匹配 → 检索全部失败 |
| `creds` 对象 (`UserChatCreds`) | `chat.ts`/`search.ts` 构建 | `agent.ts`/`retrieve.ts` 消费 | BYOK key 解析失败 |
| `tools` 对象 ↔ `TOOL_DEFS` 数组 | `tools/index.ts` 同文件 | LLM 收 TOOL_DEFS / dispatch 查 tools | 工具能定义但无法执行（或反之） |
| `TOOL_LABEL` 映射 | `Chat.tsx` | 时间轴渲染 | 工具显示原始 name 而非中文 |
| `Activity` 类型 | `Chat.tsx` SSE 构建 | `Chat.tsx` 渲染 + 历史回显降级 | 时间轴渲染崩溃 |
| `ENC_KEY` | `config` env | `crypto.ts` 派生密钥 + 所有已加密 user key | 改值 → 所有用户 key 不可解密 |
| `kb_token` localStorage | `api.ts` 写 | `api.ts` 读 + `App.tsx` authed 判断 | 登录态丢失 |
| `kb.webSearch` localStorage | `Chat.tsx` 写 | `Chat.tsx` 读 | 联网开关状态不持久 |
| `normalizeMath` | `Chat.tsx`/`NotePanel`/`DocPreview` 各自定义 | MarkdownRender 调用前 | LaTeX 公式不渲染（三处须同步改） |
| 品牌色 `#5786FE` | 散落 styles.css 多处 | cite-chip / tool-toggle / activity-node.search / blockquote | 改色须全局搜索替换 |

## 全局不变量（安全底线，任何修改不得违反）

1. **多租户隔离**：所有 `documents`/`chunks`/`conversations`/`messages` 查询必须 `WHERE user_id = $userId`。按 id 查找必须 `and(eq(id), eq(userId))`。`messages` 按 conversation_id 查前必须 `verifyOwnership`。
2. **BYOK 边界**：`creds` 对象是 route→agent 的唯一契约，绝不传 raw `User` 行。Embedding/OCR 永远系统级 key，不走用户 key。
3. **密钥不泄漏**：`encrypt/decrypt` 是 user key 唯一加解密路径。解密值只在 `resolveChatApiKey` 瞬时存在，绝不入库/入日志。`safeUser()` 是对外响应唯一出口。
4. **资源释放**：`getPoolClient()` 必须 `try/finally release`。SSE 路由 `finally` 必须清心跳+超时+并发槽位。
5. **迁移幂等**：新 migration 必须 `IF NOT EXISTS`，不可引用尚未添加的列。
6. **流式不回退**：`StreamingAnswerExtractor` 不可替换为完整 `JSON.parse`（会破坏真流式）。前端 150ms 节流不可删除（markstream 全量重解析会卡）。
7. **错误不泄漏**：5xx 响应体只能是通用文案，内部细节只入日志。
8. **工具不抛异常**：工具执行失败返回错误字符串作为 content，不 throw（避免中断 agent 循环）。web 工具尤其如此。
