# server/AGENTS.md — 后端维护指南

> 按 sublayer 组织。每层给出：**抽象边界**（对外契约）、**扩展点**（怎么加东西）、**不变量**（不可违反）、**雷区**（看起来能改但不能改）。

---

## Config 层 (`server/src/config/`)

### 抽象边界
- `config` 单例对象是全后端配置唯一来源。所有 env 读取集中在此，其他文件只 `import { config }`。
- `config.tuning` 是调参集中地——所有可调魔法数字在此，代码中读 `config.tuning.*` 而非硬编码。

### 扩展点
- **加调参**：`config.tuning` 加 `xxx: Number(process.env.XXX || 默认值)`。代码读 `config.tuning.xxx`。
- **加必填 env**：用 `req(name)`（无 fallback），缺失启动即报错。加可选 env 用 `req(name, fallback)`。

### 不变量
- `dotenv.config()` 在 `config/index.ts` 顶部执行——此模块必须是进程最先加载的之一。
- `encrypt/decrypt`（crypto.ts）是用户 BYOK key **唯一**加解密路径。密钥派生：`SHA-256(config.encKey)` → 32 字节 AES-256-GCM key。

### ⚠️ 雷区
- **`ENC_KEY` 改值 = 砖所有用户 key**。SHA-256 派生意味着任意长度输入都行，但改了就无法解密历史数据。生产轮换须先迁移。
- **`req()` 用 `??` 不是 `||`**：空字符串 `""` 被当作有效值。`CHAT_API_KEY=""` 不会报错，而是延迟到 agent 调用时才报 "no API key"。
- **retry 双层陷阱**：`withRetry` 包装的外层 + OpenAI client 内置 `maxRetries:3`。若 `withRetry` 包了一个已用 `makeChatClient` 的调用，会双重重试。加 retry 前检查调用链。
- `encKey` 有 dev fallback `"dev-only-please-change-32bytes-long!!"`——生产必须覆盖，否则加密形同虚设。

---

## DB 层 (`server/src/db/`)

### 抽象边界
- **双查询模式**：`getDb()` 返回 Drizzle（类型安全 CRUD）；`getPoolClient()` 返回原生 pg client（pgvector/trigram/ts_headline 等原生 SQL）。
- `schema.ts` 是 Drizzle 类型定义，**migration SQL 是真实 DDL**。两者分离维护。

### 扩展点
- **加表/列**：改 `schema.ts` + 新增 `migrations/000N_xxx.sql`（幂等）。Drizzle schema 反映迁移后终态。
- **加 pgvector 查询**：只能用 `getPoolClient()` + 原生 SQL + `$1::vector` cast。

### 不变量
- **`getPoolClient()` 必须 `try/finally { client.release() }`**——泄漏会耗尽连接池（max:20）。
- 迁移必须幂等（`IF NOT EXISTS`），因为 migrator 整文件单事务执行，不拆语句。
- 迁移不可引用尚未添加的列（按序执行）。

### ⚠️ 雷区
- **`embedding vector(1024)` 列不在 `schema.ts` 里**——Drizzle 无 vector 类型。它只存在于 `migrations/0001_init.sql`。**不要**把它加进 schema.ts；Drizzle 查询不触碰此列，所有向量操作走原生 SQL。
- **schema.ts vs migration 的时序差**：`0001_init.sql` 建的 `users` 没有 `chat_api_key_enc`（`0002_byok.sql` 加），`conversations` 没有 `scope_doc_ids`（`0003_scope.sql` 加）。但 `schema.ts` 声明所有最终列。fresh DB 须跑完全部迁移才与 schema.ts 一致。
- `updated_at` 触发器（0001_init.sql）在 BEFORE UPDATE 自动设值——代码设 `status` 时 `updatedAt` 自动更新，无需手动。
- `closeDb()` 在优雅关闭时调用，null 化单例。不要在请求处理中调 `closeDb`。

---

## Auth 层 (`server/src/auth/`)

### 抽象边界
- `authGuard`（middleware.ts）是 preHandler，验证 JWT + 查 DB → 挂载 `req.user`（完整 User 行）。
- `requireUser(req)` 是 handler 取用户的标准入口，返回 `User` 或 throw。
- **`creds` 对象** (`UserChatCreds`) 是 route→agent 的 BYOK 契约边界：`{ chatApiKeyEnc, chatModel, chatBaseUrl }`。

### 扩展点
- **加认证路由**：`{ preHandler: [authGuard] }`。无需认证的路由不加 preHandler。
- **加用户字段**：schema 加列 + migration + `setUserChatConfig` 类似函数 + `safeUser` 剥离逻辑。

### 不变量
- **绝不把 raw `User` 行传过 `creds` 边界**到 agent/retrieve。`req.user` 含 `passwordHash`/`chatApiKeyEnc` 等敏感字段，只活在 route 层。
- **`safeUser()` 是对外响应唯一出口**：剥离 `passwordHash`/key，只返回 `{id, email, hasNewapiKey, chatBaseUrl, chatModel, embeddingModel}`。
- `verifyOwnership(userId, conversationId)` 必须在按 conversation_id 查 messages 前调用（防 IDOR）。
- `setUserChatConfig` 同时写 `chatApiKeyEnc` 和 `newapiKeyEnc`（向后兼容旧字段）。

### ⚠️ 雷区
- `verifyJwt` 用 `crypto.timingSafeEqual`，但前面有长度检查（不等长直接返回 null）——这是必须的，timingSafeEqual 不等长会 throw。改 JWT 逻辑勿删长度检查。
- `resolveChatModel` 硬编码 `glm-4.6` 回退——旧用户 model 字段可能是已下线的 glm-4.6，强制回退到 config.chatModel。不要删此兼容逻辑。
- `search.ts` 构建的 creds 只用 `newapiKeyEnc`（不用 `chatApiKeyEnc || newapiKeyEnc`），与 `chat.ts` 不一致。当前无害（search 路径只用系统 embedding key），但若未来 search 需要 user chat key 会出 bug。

---

## Routes 层 (`server/src/routes/`)

### 抽象边界
- 路由是 transport 层：认证、校验、构建 creds、调 service/agent、返回 JSON。**业务逻辑不在此层**。
- `chat.ts` 的 `/chat/stream` 是唯一 SSE 端点。

### 扩展点
- **加路由文件**：导出 Fastify 插件 → `index.ts` 注册 `{ prefix: "/api" }`。
- 错误优先用 `throw new AppError 子类`（ValidationError 400 / AuthError 401 / NotFoundError 404 等），全局 handler 自动映射。

### 不变量
- **多租户**：所有 DB 查询带 `WHERE user_id`。按 id 查用 `and(eq(id), eq(userId))`。
- **SSE 路由 `finally` 必须清理**：心跳 interval + 超时 AbortController + `activeStreams.delete(userId)`。漏任一项 → 资源泄漏。
- SSE 必须设 `X-Accel-Buffering: no`（Nginx 不缓冲）+ 15s 心跳注释（保活代理）。

### ⚠️ 雷区
- **两种错误风格共存**：`chat.ts`/`export.ts` 用 `throw AppError`（推荐）；`documents.ts`/`auth.ts` 用手动 `reply.code(4xx).send({error})`（遗留）。**同一路由内勿混用**。新代码用 throw。
- **限流和并发控制是 in-process**（Map 内存），非全局。多实例部署时每实例独立计数。不要假设全局限流。
- `authGuard` 用 `reply.send` 短路（不能 throw，因为 preHandler 返回 reply 才干净中断）。
- SSE 部分答案持久化：流中断时若已输出 >20 字符，保存部分内容 + "⚠️（回答被中断）"。改此逻辑注意别丢用户已看到的内容。

---

## Agent 层 (`server/src/rag/agent.ts`)

### 抽象边界
- `agentAnswer`（非流式）和 `agentAnswerStream`（流式 async generator）是两个入口，签名对称。
- `StreamEvent` 联合类型是 agent→SSE→前端的契约。前端 `Chat.tsx` switch 消费每种事件。
- `StreamingAnswerExtractor` 从流式 `finish` 工具参数中增量提取 answer 字段。

### 扩展点
- **改 system prompt**：`SYSTEM_PROMPT` 常量。注意 finish 工具的强制要求（模型必须调 finish 终止）。
- **改迭代上限**：`config.tuning.agentMaxIters`（默认 10）。勿硬编码。

### 不变量
- **`StreamingAnswerExtractor` 不可替换为完整 `JSON.parse`**——它会破坏真流式（等全部 arg 到齐才解析）。它是字符级状态机，处理 JSON 转义跨片段边界。
- **finish 工具是唯一正常终止信号**。模型不调 finish 时：要么超迭代上限兜底，要么模型直接输出 >20 字符文字当答案。
- **工具失败不 throw**——catch 后作为 `tool` 消息回填 `工具执行失败：${msg}`，循环继续。
- **webSearchCount 限制**：`web_search`/`web_scrape` 每轮上限 `config.tuning.maxWebSearchPerTurn`（默认 3），超限拒绝执行返回提示。
- **上下文压缩两阶段**：先 `downgradeToolResult`（降级旧工具结果为 stub），仍超阈值才 `compressHistory`（LLM 摘要）。避免不必要的 LLM 调用。

### ⚠️ 雷区
- `agentAnswer` 和 `agentAnswerStream` 共享大量逻辑但有细微差异。改一处逻辑须评估另一处是否需同步（如 webSearchCount 限制两处都有）。
- 流式中 `delta.content`（模型直接输出文字）累积到 `contentAcc` 但**不直接 yield**——text answer 路径在 finish_reason=stop 后按行补推。改此逻辑注意别重复推送。
- citations 去重按 `docId`——同一文档多个 chunk 只产一个引用。改去重逻辑影响引用显示。
- `reasoning_content` 是 DeepSeek 扩展字段（非 OpenAI 标准），须 `(delta as any).reasoning_content` 访问。

---

## Tools 层 (`server/src/tools/index.ts`)

### 抽象边界
- `tools` 对象：工具名→执行函数映射。
- `TOOL_DEFS` 数组：OpenAI function-calling schema 定义。
- **两者是平行结构，同文件手动维护，必须同步**。
- `getToolDefs({webSearch})`：过滤后返回给 LLM 的工具列表。`executeTool(name,args,ctx)`：按名 dispatch 执行。

### 扩展点
- **加工具**：见 AGENTS.md SOP。核心：`tools` 对象加实现 + `TOOL_DEFS` 加 schema（name 一致）。

### 不变量
- **`executeTool` 无运行时参数校验**——LLM 的 JSON.parse 后 args 直接传入。工具函数必须防御性解析 args（解构 + 默认值）。
- **工具不抛异常**——失败返回 `{ content: "错误信息" }`，让 agent 循环继续。web 工具尤其如此。
- **web 工具双门控**：前端 `webSearch` flag + 服务端 `TAVILY_API_KEY` env。`getToolDefs` 两者都满足才包含 web 工具。
- 所有 DB 访问 `WHERE user_id = ctx.userId`。note 工具额外 `eq(kind, "note")` 防止操作 file 类文档。
- 变更文档的工具（create_note/update_note）动态 `import("../jobs/queue.js")` 调 `enqueueIngest`——动态 import 避免循环依赖。

### ⚠️ 雷区
- `WEB_TOOL_NAMES` Set 控制哪些工具被 webSearch 开关门控。加新网络工具须加入此 Set，否则开关关闭时仍会被 LLM 看到。
- `finish` 工具是特殊终止符——agent 循环专门检测它。不要把它当普通工具处理。
- `TOOL_NAMES = Object.keys(tools)` 包含 web 工具（即使被门控禁用）——不要用它判断"当前可用工具"，用 `getToolDefs()` 的返回。

---

## Ingest 层 (`server/src/ingest/` + `server/src/jobs/`)

### 抽象边界
- **队列**（queue.ts）：Redis BLPOP + inflight ZSet + ack。`enqueueIngest` 入队，`dequeueIngest` 阻塞出队，`ackIngest` 确认。
- **pipeline**（pipeline.ts）：状态机编排 `extracting → (ocr) → chunking → embedding → ready/failed`。
- **extract**（extract.ts）：策略模式 switch，按扩展名分发到各格式抽取器。
- **chunk**（chunk.ts）：Markdown 切分 + locator 注释解析。
- **embed**（embed.ts）：智谱 embedding 批量调用。

### 扩展点
- **加文件格式**：见 AGENTS.md SOP。extract.ts switch + `<!-- k=v -->` locator 注释。
- **加 pipeline 阶段**：pipeline.ts 插入 `setStatus` + 处理逻辑；前端 `STATUS_LABEL` 加映射 + 轮询谓词加新非终态。

### 不变量
- **队列可靠性**：dequeue → 移入 inflight → 处理 → ack。**ack 前不删 payload**。worker 失败也须 ack（先标 doc failed 再 ack），否则 job 卡在 inflight 直到 5 分钟 stale recovery。
- **worker 不自动重试**——失败 doc 需用户手动点"重试"（reingest 端点重新入队）。
- **pipeline 幂等**：重新摄入同 doc 先 `DELETE FROM chunks WHERE doc_id` 再 INSERT。
- **embedding 必须原生 fetch**（非 OpenAI SDK）+ 显式 `dimensions` —— SDK 传 dimensions 会静默返回 256 维（bug），原生 fetch 稳定返回 1024。
- **EMBEDDING_DIM 三方一致**：env / pgvector 列 / embed 请求体。
- **OCR 部分失败容忍**：单 chunk 失败嵌入注释 `<!-- FAILED: msg -->`，不 abort 整个 OCR。

### ⚠️ 雷区
- **`enqueueIngest` 有 Redis 不可用降级**：fallback 到内联同步执行（dev 模式）。worker 进程**无此降级**——Redis 挂了 worker 直接 exit(1)。
- **locator 注释协议**：`<!-- k=v k2=v2 -->` 格式。extract.ts 写、chunk.ts `parseLocator` 读。改格式须双方同步，影响 `chunks.locator` → 引用显示全链路。
- **chunk token 估算**：`Math.ceil(text.length / 2.5)`——粗略估算（非真实 tokenizer），用于预算不用于计费。不要当精确值用。
- **OCR 的 JWT 签名**：`GLM_OCR_API_KEY` 是 `{id}.{secret}` 格式，手写 HS256 JWT。改 OCR 认证逻辑注意此格式。
- `hardSplit`（chunk.ts）有反无限循环守卫 `if (i <= 0) i = end`——不要删。
- pdf-parse 不给逐页文本，locator 退化为整文档级；OCR 路径才恢复页级 locator。
