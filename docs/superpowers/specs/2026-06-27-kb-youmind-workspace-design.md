# private-kb YouMind 式统一工作区 — 设计规格

> 站点：`https://kb.meimaobing.ai` · 代码：`/opt/private-kb` · 版本基线：v0.1

## 背景

`private-kb` 后端已具备多租户 RAG、笔记 CRUD、Agent 13 工具、对话 scope、SSE 流式引用。前端仍为**分页导航**（对话 / 知识库 / 写笔记 / 检索 / 设置），Chat 内 `NotePanel` 只读，无法在单屏完成 YouMind 式「读 → Pick → 问 → 改 → 存」闭环。

## 目标

将登录后主界面重构为 **YouMind 式三栏统一工作区**：

| 栏位 | 职责 | YouMind 映射 |
|------|------|-------------|
| 左 240px | 文档/笔记树 + 对话列表 | Files / Materials |
| 中 flex-1 | Markdown 编辑/预览 | Crafts / Editor |
| 右 380px | AI 对话 + 引用 + 工具时间轴 | Task / Chat |

## 非目标（YAGNI）

- 多 Board / 项目容器（MVP 用「当前对话 + scope」代替）
- Chrome 扩展 / 网页剪藏
- 多模态生成（图片/幻灯片/视频）
- 移动端三栏（MVP 仅 desktop ≥1280px；<1024px 显示「请用桌面浏览器」提示）
- Reranker / PageIndex（已有 roadmap，不在本次范围）

## 架构

```
WorkspaceShell
├── TopBar（搜索⌘K · 上传 · 新建笔记 · 设置）
├── FileTree（左）
├── EditorPane（中）── SelectionContextBar
└── ChatPane（右，从 Chat.tsx 抽出）
         │
         ▼
WorkspaceStore（React Context）
  activeDocId, draftTitle, draftContent, dirty
  selection: { text, start, end } | null
  convoId, scopeDocIds, panelWidths
```

**后端改动**：P1/P2 复用现有 API；P3 在 SSE 流中新增 `event: doc_patch`（Agent 调用 `update_note` 时推送）。

## 三 Phase

| Phase | 范围 | 后端 |
|-------|------|------|
| P1 | 三栏壳层 + FileTree + Editor + Chat 同屏 | 无 |
| P2 | Pick 选区、scope 绑定当前文档、引用跳转 | `selection` 字段注入 chat/stream |
| P3 | AI 改文件 → 编辑器 diff → 确认保存 | `doc_patch` SSE 事件 |

---

## 验收标准（O / B / D）

### 一票否决（任一 FAIL = 整体 FAIL）

| ID | 类型 | 标准 |
|----|------|------|
| V1 | O | 登录后不再出现旧式「知识库/写笔记/检索/对话」四个主导航 Tab |
| V2 | B | 在 ≥1280px 视口，三栏同时可见且可交互 |
| V3 | B | 编辑笔记保存后刷新，内容一致且 `/api/search` 可搜到新内容（≤90s） |
| V4 | B | 现有 `/api/chat/stream` 引用角标 `[n]` 与 citations chip 仍正常工作 |

### 观察性（O）

| ID | 标准 |
|----|------|
| O1 | 左栏展示用户全部 `documents`（含 `kind=note` 与上传文件），带 status badge |
| O2 | 中栏打开 note 类型文档时显示标题输入 + Markdown textarea + 保存按钮 + 预览切换 |
| O3 | 右栏保留：流式输出、活动时间轴、联网开关、scope badge、引用 chips |
| O4 | 面板宽度拖拽后写入 `localStorage` 键 `kb.workspace.layout` |
| O5 | P2：选区存在时，输入框上方显示 SelectionContextBar（字数 + 清除） |
| O6 | P3：Agent 调用 `update_note` 后，编辑器出现 diff 预览条（接受/拒绝） |

### 行为性（B）

| ID | 标准 |
|----|------|
| B1 | 点击左栏笔记 → 中栏加载内容；未保存切换文档时弹出确认 |
| B2 | 中栏保存 → 调用 `PATCH /api/documents/:id` → toast 成功 → 左栏 status 变 pending→ready |
| B3 | 打开文档时，当前对话 scope 自动设为 `[docId]`（用户可手动改回「全部」） |
| B4 | 在中栏选中 ≥10 字符 → 点击「加入对话」→ 下条 user 消息 API body 含 `selection` |
| B5 | 带 selection 的提问，AI 回复应针对选区（验收用笔记内独有句子验证） |
| B6 | 点击引用 chip → 若 docId 为当前文档，中栏 scroll 到 snippet 近似位置 |
| B7 | P3：对话「把第二节改成要点列表」→ Agent update_note → diff 预览 → 接受后磁盘更新 |
| B8 | ⌘K 打开 CommandPalette，输入关键词调用 `/api/search`，Enter 打开对应文档 |
| B9 | `/settings` 路由仍可达 BYOK 设置页 |

### 数据性（D）

| ID | 标准 |
|----|------|
| D1 | `PATCH /api/documents/:id` 请求体 `{ title, content }` 与现网一致 |
| D2 | `POST /api/chat/stream` 新增可选字段 `selection: { docId, text, start?, end? }` |
| D3 | SSE 新增 `event: doc_patch`  payload: `{ docId, title?, content, previousContent }` |
| D4 | `localStorage['kb.workspace.layout']` JSON: `{ leftWidth, rightWidth, leftCollapsed }` |

---

## YouMind 借鉴原则（实现时对照）

1. **做减法**：编辑器仅保留常用工具栏（保存/预览/导出），留白优先
2. **Pick 按需出现**：选中文本时才显示「加入对话」，不常驻复杂按钮
3. **Side Peek 定位**：PDF 等非 Markdown 用 `DocPreview`  overlay，不占中栏
4. **IPO 闭环**：资料（左）→ 编辑（中）→ 对话（右）不跳页
5. **可溯源**：引用 chip 可跳回源文档

## 文件索引（新增/主要改动）

| 路径 | 动作 |
|------|------|
| `web/src/workspace/WorkspaceShell.tsx` | 新建 |
| `web/src/workspace/WorkspaceStore.tsx` | 新建 |
| `web/src/workspace/FileTree.tsx` | 新建 |
| `web/src/workspace/EditorPane.tsx` | 新建 |
| `web/src/workspace/ChatPane.tsx` | 新建（从 Chat.tsx 迁） |
| `web/src/workspace/SelectionContextBar.tsx` | 新建 |
| `web/src/workspace/CommandPalette.tsx` | 新建 |
| `web/src/workspace/types.ts` | 新建 |
| `web/src/App.tsx` | 改：Workspace 为默认 |
| `web/src/styles.css` | 改：三栏布局样式 |
| `web/src/api.ts` | 改：stream body 增 selection |
| `server/src/routes/chat.ts` | 改：解析 selection + doc_patch 事件 |
| `server/src/rag/agent.ts` | 改：注入 selection 上下文 |
| `web/vitest.config.ts` | 新建 |
| `server/test/workspace-context.test.ts` | 新建 |
| `server/test/playwright-workspace.spec.ts` | 新建 |
