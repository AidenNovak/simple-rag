# private-kb Live Craft 编辑器 — 设计规格

> 代码库：`/Users/lijixiang/ZCodeProject/private-kb`  
> 前置：`docs/superpowers/specs/2026-06-27-kb-youmind-workspace-design.md`、布局完整性 spec

## 问题

1. 中栏「预览/编辑」二元切换生硬，默认 textarea 无 MD 排版  
2. 预览模式下点击 Chat 引用 `[n]` 无法定位（textarea 未挂载）  
3. Scope 下拉在窄栏内被裁剪/覆盖  
4. 右栏仍用全屏 Chat 空态文案与 `max-width:768px` 居中

## 目标

**Live Craft View**：默认渲染 Markdown；双击/`E` 打开 Side Peek 源码；Pick 在渲染态可选；引用跳转在 Craft 内 scroll+高亮；右栏对话工作区化。

## 非目标

- Milkdown/Tiptap 全 WYSIWYG  
- 块级 contenteditable  
- 移动端 Craft 优化

## 架构

```text
EditorPane
├── CraftToolbar（标题 + 字数 + 保存状态）
├── CraftBody（markstream 渲染，Pick，scroll target）
├── SourcePeek（40% 宽滑层，debounce 800ms 保存）
├── SelectionContextBar
└── PatchBar（doc_patch diff）

ChatPane
├── ScopeDropdown（React portal → body）
├── FilePeekPanel（文件 cite，非全屏 modal）
└── ws-chat scoped 样式（无 768px 居中）
```

## Editor 状态机

```text
craft (default)
  ├─ peek-open (Side Peek 编辑)
  └─ patch-pending

craft + double-click / key E → peek-open
peek-open + Esc → craft
doc_patch → patch-pending → accept → craft
```

## 验收标准

### 一票否决

| ID | 标准 |
|----|------|
| EV1 | 打开 note 默认显示渲染 MD，无「预览/编辑」按钮 |
| EV2 | 点击 Chat cite-chip → 中栏滚到片段并 flash 高亮（preview 模式不存在） |
| EV3 | Scope 下拉完整可见，不被右栏 overflow 裁剪 |

### 观察性（O）

| ID | 标准 |
|----|------|
| EO1 | `CraftBody` 使用 markstream 渲染 `draftContent` |
| EO2 | Side Peek 从右侧滑入，宽约 40%，含 Markdown textarea |
| EO3 | Toolbar 显示「已保存 / 保存中 / 未保存」状态点 |
| EO4 | 右栏空态含当前笔记标题或「请先选择笔记」 |

### 行为性（B）

| ID | 标准 |
|----|------|
| EB1 | 双击 Craft → 打开 Side Peek；Esc → 关闭 |
| EB2 | Side Peek 停输 800ms 自动 `PATCH` 保存 |
| EB3 | Craft 中选 ≥10 字 → SelectionContextBar 出现 |
| EB4 | Agent doc_patch → Craft 重渲染；Side Peek 开则同步内容 |
| EB5 | composer placeholder 含「当前笔记」语义 |

### 数据性（D）

| ID | 标准 |
|----|------|
| ED1 | 真源仍为 `contentMd`；`api.updateNote(id, title, content)` 不变 |
| ED2 | `workspace:scroll-to` 事件 detail 仍为 snippet 字符串 |

## 文件索引

| 路径 | 动作 |
|------|------|
| `web/src/workspace/craft/scrollToSnippet.ts` | 新建 |
| `web/src/workspace/craft/CraftBody.tsx` | 新建 |
| `web/src/workspace/craft/SourcePeek.tsx` | 新建 |
| `web/src/workspace/craft/useDebouncedSave.ts` | 新建 |
| `web/src/workspace/ScopeDropdown.tsx` | 新建 |
| `web/src/workspace/FilePeekPanel.tsx` | 新建 |
| `web/src/workspace/EditorPane.tsx` | 改 |
| `web/src/workspace/ChatPane.tsx` | 改 |
| `web/src/workspace/layout.css` | 改 |
| `web/src/styles.css` | 改 ws-chat scope |
