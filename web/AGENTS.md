# web/AGENTS.md — 前端维护指南

> 按 sublayer 组织。每层给出：**抽象边界**、**扩展点**、**不变量**、**雷区**。
> 前端无路由库、无状态管理库、无 UI 库——这是有意为之的简洁。

---

## App 层 (`web/src/App.tsx` + `main.tsx`)

### 抽象边界
- **无路由库**：导航是纯 `useState<View>`，`View = "chat" | "documents" | "notes" | "search" | "settings"`。条件渲染 `{view === "x" && <Screen/>}`。
- **auth 状态**：`authed`（bool）+ `user` 对象存在 App 组件 state。token 在 localStorage `kb_token`。
- **跨组件通信**：用 `window` 事件（无全局 store）：
  - `auth:logout` 事件 → App 设 `authed=false`（api.ts 401 时 / Settings 登出时触发）
  - `nav` 事件（`CustomEvent detail: View`）→ App 切屏（Chat 空状态按钮跳转用）

### 扩展点
- **加屏幕**：见 `AGENTS.md` SOP——`View` 联合类型 + `navItems` + 渲染块。
- **加侧栏会话操作**：会话列表的 rename/delete 逻辑在 App.tsx（`editingConvo`/`editTitle` state）。

### 不变量
- `authed` 初始值 `!!getToken()`——token 存在即认为已登录，mount 时 `api.me()` 验证。
- 401 必须触发 `clearToken` + `auth:logout` 事件——绝不能静默处理。
- 会话切换时 Chat 组件内部 abort 流式请求（防答案泄漏到错误会话）。

### ⚠️ 雷区
- `onConvoCreated` 回调 prepend 新会话到列表 + 设为 active——改会话列表逻辑注意别丢这个回调。
- 移动端侧栏是 `@media (max-width:768px)` 滑入抽屉（`.app.mobile-open`），改布局注意移动端适配。

---

## API 层 (`web/src/api.ts`)

### 抽象边界
- 单个 `req(path, init)` 私有封装：`fetch(`/api${path}`)` + 自动附加 `Bearer ${token}`。
- 所有 `api.xxx` 方法是一行调用 `req`。
- **流式/二进制端点绕过 `req`**：`Chat.tsx` 的 `/chat/stream`、`DocPreview` 的下载、`Notes` 的导出——都手动 `fetch` + 手动加 Bearer header。

### 扩展点
- **加 API 方法**：`api.xxx = (args) => req("/path", { method, body, headers })`。
- **加流式端点**：不进 `api.ts`，在调用方直接 `fetch` + `getReader()`。

### 不变量
- `req` 返回 `res.json()`——不支持流式。流式必须绕过。
- 401 → `clearToken()` + dispatch `auth:logout` + throw——这是唯一登出触发点。
- `getToken/setToken/clearToken` 操作 localStorage `kb_token`——token 持久化唯一路径。

### ⚠️ 雷区
- `upload(file)` 用 FormData，**不能设 Content-Type header**（浏览器自动设 boundary）。
- `req` 的 `!res.ok` 分支 parse JSON body 取 `error` 字段——后端必须返回 `{ error: string }` 形状。
- `/auth/newapi-key` 端点名是历史遗留（旧称 NewAPI）——不要改名，会破坏 API 契约。

---

## Chat 层 (`web/src/screens/Chat.tsx`) — 前端最复杂

### 抽象边界
- **SSE 消费**：`runAsk` 函数读 `/api/chat/stream` 的 `ReadableStream`，解析 SSE 帧，构建 `activities` 时间轴 + 累积 `answerAcc` 答案。
- **消息类型层级**：`Msg` > `Activity`（时间轴节点）> `ToolCall`/`Citation`。
- **`activities` 是时间轴规范源**：`toolCalls` 是历史回显降级（从 DB 加载的旧消息无 activities，从 toolCalls 合成）。

### SSE 事件处理契约
`switch(evtName)` 必须与服务端 `StreamEvent` 类型一致：

| 事件 | 前端处理 |
|------|----------|
| `citations` | 设 `last.citations = data` |
| `toolCalls` | **追加**（非替换）到 `last.toolCalls` + push Activity 节点 |
| `reasoning` | 同轮续片追加到当前 reasoning activity；新一轮新建 activity（`reasoningNewRound` 判断） |
| `error` | throw（进 catch 处理） |
| `done` | 清 interval + flush + 持久化 + followUps |
| default(message) | `answerAcc += data.delta`（流式答案累积） |

### 扩展点
- **加 SSE 事件类型**：服务端 `StreamEvent` 加类型 → `chat.ts` SSE 转发加 `event:` → `Chat.tsx` switch 加 case。三方同步。
- **加工具标签**：`TOOL_LABEL` 映射加 `{ name: "中文标签" }`。

### 不变量
- **150ms 节流不可删除**：delta 累积到闭包 `answerAcc`，`setInterval(flushToDOM, 150)` 才刷 React state。markstream-react 每次 content 变化全量重解析 Markdown，逐 token 更新会卡死长答案。
- **会话切换 abort**：`abortRef.current.abort()` 防流式写入错误会话。
- **`reasoningNewRound` 逻辑**：收到 toolCalls/delta 后置 true，下一个 reasoning 新建 activity；同轮续片纯追加。控制时间轴的思考节点分段。
- **`normalizeMath` 必须在 `MarkdownRender` 前**：DeepSeek 用 `\[…\]` LaTeX，markstream 期望 `$$…$$`。
- **`CitationTextNode` 自定义渲染**：`MARKSTREAM_CUSTOM = { text: CitationTextNode }` 传给 MarkdownRender，把正文 `[n]` 渲染为蓝色 `<sup class="inline-cite">`。只影响 text 节点，代码块不受影响。

### ⚠️ 雷区
- **JSON.parse 容错**：每个 SSE data line 都 try/catch，损坏帧跳过不崩溃。不要改成严格解析。
- **`done` 事件后 `answerAcc` 兜底**：`content: answerAcc || last.content`——防止流式中断时 content 丢失。
- **历史回显降级**：旧消息无 `activities`，从 `toolCalls` 合成（无 reasoning 节点）。改 Activity 类型注意降级路径。
- `ContextBar` 的模型窗口硬编码：`deepseek-v4-pro: 1_000_000` / `deepseek-v4-flash: 128_000`。加模型须同步。
- `NotePanel` state 在 Chat.tsx 声明但当前无触发路径——DocPreview 是实际预览入口。不要假设 NotePanel 已接入。

---

## 其他屏幕

### Documents (`screens/Documents.tsx`)
- 3 秒轮询 `api.listDocs()`，仅当有非终态文档时持续轮询（`STATUS_LABEL` 映射 + 轮询谓词须与 pipeline status 枚举同步）。
- 拖拽 + 点击上传，`accept` 属性列支持格式——加格式须同步。
- `DocPreview` 预览 ready 文档。

### Notes (`screens/Notes.tsx`)
- 笔记列表来自 `api.listDocs()` 过滤 `kind === "note"`。
- 导出：PDF 走浏览器打印（`marked` 渲染 HTML → 弹窗打印），DOCX 走 blob 下载 `/api/notes/:id/export/docx`。
- `normalizeMath` 在此重复定义（三处之一）。

### Search (`screens/Search.tsx`)
- 独立混合检索（向量+关键词 RRF），直接调 `api.search(q, 10)`，无 LLM 调用。
- 结果卡片显示 `source`/`score` badge + locator。

### Settings (`screens/Settings.tsx`)
- 4 卡片：Chat 模型选择 / BYOK 绑定 / Embedding 模型 / 账户登出。
- 每次保存后 `api.me()` + `onUpdate(r.user)` 刷新 App.user。
- 登出：清 `kb_token` + dispatch `auth:logout`。

### Auth (`screens/Auth.tsx`)
- 登录/注册切换（`mode` state）。`onDone(token, user)` 回调给 App。

---

## 共享组件 (`web/src/components/`)

### Toast (`Toast.tsx`)
- Context-based。`useToast()` 暴露 `show(type, message)`。3500ms 自动移除。
- 全局通知唯一入口——不要用 `alert/console`。

### DocPreview (`DocPreview.tsx`)
- 模态预览。笔记渲染 `contentMd`，文件渲染提取文本。
- 下载原始文件走 `/api/documents/:id/download`（blob，手动 Bearer）。
- Escape 关闭。`normalizeMath` + `MarkdownRender final`。

### NotePanel (`NotePanel.tsx`)
- 右侧可拖拽调整宽度的面板（非模态）。width state 300-800。
- 复制/PDF/Word 导出按钮。`normalizeMath` 在此重复定义。

---

## 样式层 (`web/src/styles.css`)

### 抽象边界
- 单全局 CSS 文件，无 CSS modules / Tailwind。暗色 only（`color-scheme: dark`）。
- `:root` CSS 变量定义主题：`--bg-main #212121` / `--bg-sidebar #171717` / `--bg-elevated #2f2f2f` / `--text #ececec` 等。
- markstream-react 样式用 `!important` 覆盖（库自带 `--background`/`--foreground` 变量）。

### 不变量
- **品牌色 `#5786FE` 散落多处**（cite-chip / tool-toggle / activity-node.search / blockquote / link / inline-cite）——**非 CSS 变量**。改色须全局搜索替换。
- 活动时间轴配色：reasoning 紫 `#a78bfa` / tool 绿 `#34d399` / search 蓝 `#5786FE`。

### ⚠️ 雷区
- **markstream-react 版本升级**可能新增组件类需要覆盖。升级后检查渲染是否白底/错色。
- `#5786FE` 改色：搜 `5786FE` / `5786fe`（CSS 不区分大小写）全部替换。
- `.activity-timeline` 左侧竖线 + `::before` 圆点是时间轴视觉核心——改布局注意圆点对齐。
- 移动端 `@media (max-width:768px)` 侧栏抽屉——改布局注意适配。

---

## Icons (`web/src/Icons.tsx`)

### 抽象边界
- 每个图标是函数组件 `(props) => <svg {...base(size)} {...p}>`。
- `base(size=20)` 返回共享 SVG 属性：Lucide 风格 stroke-based，`strokeWidth=1.75`，`currentColor` 继承。
- `IconDeepSeek` 例外：fill-based 品牌图标。导出 `DEEPSEEK_BLUE = "#5786FE"`。

### 扩展点
- **加图标**：导出新组件，遵循 `base(size)` 模式。fill 类图标（如品牌 logo）另写。

### ⚠️ 雷区
- `fileIcon(fmt)` 按扩展名映射图标组件——加文件格式图标须同步。

---

## 跨层同步清单（改前端时检查后端是否需同步）

| 前端改动 | 须同步的后端 |
|----------|-------------|
| `STATUS_LABEL` 加状态 | `pipeline.ts` status 枚举 |
| `TOOL_LABEL` 加工具 | `tools/index.ts` 工具定义 |
| SSE switch 加 case | `agent.ts` StreamEvent + `chat.ts` 转发 |
| `View` 加屏幕 | 对应 `routes/` 新路由（若需新 API） |
| `accept` 加格式 | `extract.ts` switch |
| `ContextBar` 模型窗口 | `config` 默认模型 + `client.ts` resolveChatModel |
| `normalizeMath` 改逻辑 | 三处同步：Chat / NotePanel / DocPreview |
| 品牌色改色 | 全局搜 `#5786FE` 替换 |
