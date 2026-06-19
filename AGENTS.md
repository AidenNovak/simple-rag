# AGENTS.md — Coding Agent 全局指南

> 本文件是任何 coding agent 进入本项目后的**第一份必读**。
> 结构地图见 `ARCHITECTURE.md`；分层细则见 `server/AGENTS.md`、`web/AGENTS.md`。

## 项目定位

simple-rag 是一个**最简洁的 RAG 学习系统**：多用户私人知识库，主打代码可读、易于学习二次开发。核心能力：全格式文档摄入、Agent 工具调用、真流式问答、网络搜索、带引用回答。

设计哲学：
- **简洁优先**：无 ORM 抽象层、无状态管理库、无路由库。能直查 DB 就不建 repository，能 useState 就不引 Redux。
- **多租户隔离**：每条查询带 `user_id`，这是安全底线，不可妥协。
- **BYOK**：Chat 走用户自带 key，Embedding/OCR 走系统级 key，双端点严格分离。
- **真流式**：SSE 逐 token 推送，思考过程与最终答案都实时渲染。

## 修改前必读检查清单

动手前，对照你的修改类型确认已读对应指南：

| 我要改… | 必读 | 关键风险 |
|---------|------|----------|
| DB 查询 | `server/AGENTS.md` → DB 层 | 漏 `user_id` 过滤 → 跨租户泄漏 |
| SSE 事件 | ARCHITECTURE 跨层契约表 + `web/AGENTS.md` → Chat 层 | 改事件类型须同步 agent/chat.ts/Chat.tsx 三方 |
| env / 配置 | `server/AGENTS.md` → Config 层 | 调参走 `config.tuning`，勿散落魔法数字 |
| 工具 | `server/AGENTS.md` → Tools 层 | `tools` 对象与 `TOOL_DEFS` 数组必须同步 |
| 文件格式 | `server/AGENTS.md` → Ingest 层 | locator 注释协议须与 chunk.ts 保持 |
| 前端渲染 | `web/AGENTS.md` → Chat/样式层 | 150ms 节流不可删；normalizeMath 三处同步 |
| schema | `server/AGENTS.md` → DB 层 | 加 migration 须幂等；pgvector 列不进 schema.ts |

## 🔴 牵一发动全身红线（最危险的耦合点）

以下每条改动若不同步所有关联方，将导致跨层故障：

1. **`documents.status` 枚举** — 改 pipeline 写入的状态值，必须同步 `web/src/screens/Documents.tsx` 的 `STATUS_LABEL` 映射和轮询谓词（line 35 判断非终态的逻辑）。
2. **`StreamEvent` 联合类型** — `server/src/rag/agent.ts` 定义并 yield 的事件类型，必须与 `server/src/routes/chat.ts` SSE 转发的 `event:` 名、`web/src/screens/Chat.tsx` 的 `switch(evtName)` 三方一致。
3. **`EMBEDDING_DIM`** — env 变量、pgvector 列 `vector(1024)`（migration SQL）、`embed.ts` 请求体 `dimensions` 字段，三者必须一致。改一处不改另两处 → 所有检索失败。
4. **`creds` 对象** (`UserChatCreds`) — `chat.ts`/`search.ts` 构建、`agent.ts`/`retrieve.ts` 消费的 BYOK 契约。字段增减须同步双方。绝不传 raw `User` 行越过此边界。
5. **`tools` ↔ `TOOL_DEFS`** — `tools/index.ts` 中执行映射和 LLM schema 数组是两套平行结构，**同文件手动维护**。加工具必须两处都加，name 必须一致。
6. **`ENC_KEY`** — `config.encKey` 经 SHA-256 派生 AES 密钥。改值 → 所有已加密用户 key 不可解密。生产环境绝不可在线轮换而不迁移数据。
7. **locator 注释协议** — `extract.ts` 写 `<!-- k=v -->`，`chunk.ts` 的 `parseLocator` 读。改格式须双方同步，且影响 `chunks.locator` → `Citation.locator` → 前端引用显示全链路。
8. **`normalizeMath`** — LaTeX 预处理函数在 `Chat.tsx`、`NotePanel.tsx`、`DocPreview.tsx` 三处各有一份。改逻辑须三处同步。
9. **品牌色 `#5786FE`** — 散落在 `styles.css` 多处（cite-chip / tool-toggle / activity-node.search / blockquote / link / inline-cite）。非 CSS 变量，改色须全局搜索替换。
10. **SSE `finally` 清理** — `chat.ts` 流式路由的 `finally` 块必须清心跳 interval + 超时 + `activeStreams.delete`。漏任一项 → 并发槽位泄漏或心跳僵尸。

## 常见任务 SOP

### 加一个新工具
1. `server/src/tools/index.ts` — 在 `tools` 对象加实现（签名 `(args, ctx) => Promise<ToolResult>`）
2. `server/src/tools/index.ts` — 在 `TOOL_DEFS` 数组加匹配的 OpenAI schema（**name 必须一致**）
3. 若是网络类工具 → 加入 `WEB_TOOL_NAMES` Set，`getToolDefs` 会自动门控
4. DB 访问必须 `WHERE user_id = ctx.userId`
5. `web/src/screens/Chat.tsx` — 在 `TOOL_LABEL` 映射加中文名（否则时间轴显示原始 name）
6. 若工具产出 `data.chunks` → 自动被 agent 提取为 citations（无需额外代码）
7. 若工具变更文档 → 动态 `import("../jobs/queue.js")` 调 `enqueueIngest`

### 加一个新文件格式
1. `server/src/ingest/extract.ts` — switch 加 `case` + `extractXxx` 函数，返回 `{ md, locatorKind, needsOcr? }`
2. 在 markdown 中用 `<!-- k=v -->` 注释嵌入 locator（chunk.ts 会解析）
3. `web/src/screens/Documents.tsx` — 上传 `accept` 属性加扩展名
4. **无需改 chunk/pipeline/embed** — 它们是格式无关的

### 加一个新屏幕
1. `web/src/App.tsx` — `View` 联合类型加 key
2. `web/src/App.tsx` — `navItems` 数组加侧栏项
3. `web/src/App.tsx` — 加 `{view === "x" && <Screen/>}` 渲染块
4. `web/src/screens/Xxx.tsx` — 创建屏幕组件，用 `api.ts` 方法取数
5. 若需新 API → `server/src/routes/` 加路由 + `web/src/api.ts` 加方法

### 加一个新路由
1. `server/src/routes/xxx.ts` — 导出 Fastify 插件，用 `{ preHandler: [authGuard] }` 保护
2. `server/src/index.ts` — `app.register(xxxRoutes, { prefix: "/api" })`
3. DB 查询加 `WHERE user_id`；用 `requireUser(req)` 取用户
4. 错误用 `throw new AppError 子类`（优于手动 `reply.code`）
5. `web/src/api.ts` — 加 `api.xxx` 方法调用新端点

### 改 DB schema
1. `server/src/db/schema.ts` — 改 Drizzle schema（**不要加 embedding vector 列**）
2. `server/migrations/000N_xxx.sql` — 加新迁移文件，必须幂等（`IF NOT EXISTS`）
3. 不可引用尚未添加的列（迁移按序执行）
4. 若涉及 pgvector → 只能用原生 SQL（`getPoolClient`），不进 schema.ts

### 加一个 config 调参
1. `server/src/config/index.ts` — 在 `config.tuning` 加字段：`xxx: Number(process.env.XXX || 默认值)`
2. 代码中读 `config.tuning.xxx`，绝不硬编码数字

## 测试与验证惯例

```bash
# 类型检查（改任何 .ts 后必跑）
npx tsc -p tsconfig.json --noEmit

# StreamingAnswerExtractor 单测（改 agent.ts 后必跑）
npx tsx server/test/streaming-extractor.test.ts

# 前端构建（改 web/ 后必跑）
npm run web:build

# 手动验证流式（改 SSE 相关后必做）
# 开联网开关 → 问需要检索的问题 → 确认时间轴按时序出现 + 答案逐字渲染
```

## 文件修改风险分级

| 风险 | 文件 | 原因 |
|------|------|------|
| 🔴 极高 | `server/src/rag/agent.ts` | ReAct 循环核心 + 流式 + StreamingAnswerExtractor，牵连 SSE 三方契约 |
| 🔴 极高 | `server/src/tools/index.ts` | tools/TOOL_DEFS 双结构 + 工具执行 dispatch |
| 🔴 极高 | `web/src/screens/Chat.tsx` | SSE 消费 + activities 时间轴 + 150ms 节流，前端最复杂 |
| 🟠 高 | `server/src/routes/chat.ts` | SSE 路由 finally 清理 + 并发控制 + 部分答案持久化 |
| 🟠 高 | `server/src/config/crypto.ts` | 加解密唯一路径，改了砖所有用户 key |
| 🟠 高 | `server/src/db/schema.ts` + migrations | schema 与迁移分离，pgvector 不在 schema |
| 🟡 中 | `server/src/jobs/pipeline.ts` | 摄入状态机，改 status 枚举须同步前端 |
| 🟡 中 | `server/src/ingest/extract.ts` | locator 注释协议与 chunk.ts 耦合 |
| 🟢 低 | `web/src/screens/Settings.tsx` | 独立屏幕，低耦合 |
| 🟢 低 | `web/src/Icons.tsx` | 纯展示组件 |

## 分层指南索引

- **后端**（config / db / auth / routes / agent / tools / ingest）：`server/AGENTS.md`
- **前端**（app / api / chat / 样式 / 组件）：`web/AGENTS.md`
- **全局结构与跨层契约**：`ARCHITECTURE.md`
