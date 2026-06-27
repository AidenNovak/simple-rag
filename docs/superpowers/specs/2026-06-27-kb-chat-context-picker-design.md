# private-kb 右栏参考笔记选择 + AI 黑字 — 设计规格

> 代码库：`/Users/lijixiang/ZCodeProject/private-kb`  
> 延续：暖色纸面主题、`ChatPane` 工作区化

## 问题

1. **参考笔记不可选**：`contextDocId` 写死为 `activeDocId`，空态只能被动显示「围绕 xxx 提问」，用户无法在右栏独立选择 AI 参考哪篇笔记  
2. **空态布局不对**：大图标 + 被动标题，缺少可操作笔记列表  
3. **AI 回答白字**：`MarkdownRender dark` + `strong { color: #fff }` 在浅色纸面上导致加粗/部分文字不可读

## 目标

**方案 A**：独立 `contextDocId`；空态笔记单选器；composer 常驻「参考：XXX ▾」条；AI 回答在 light 主题下全文 `#1A1612`。

## 非目标

- 多参考笔记同时注入（MVP 单选）
- 参考上传文件（MVP 仅 `kind=note`）
- 改后端 API 字段名（仍用 `contextDocId`）

## 概念分离

| 字段 | 含义 | UI |
|------|------|-----|
| `activeDocId` | 中栏正在编辑/预览的文档 | 左栏 + EditorPane |
| `contextDocId` | AI 对话主参考笔记 | 空态选择器 + ContextRefBar |
| `scopeDocIds` | RAG 检索范围（可多选） | 顶栏 ScopeDropdown |

## 状态机

```text
contextDocId: null | string

SET_ACTIVE_DOC(note)  → contextDocId = id, contextDocTitle = title（同步）
SET_ACTIVE_DOC(upload) → activeDoc 变，contextDocId 不变
SET_CONTEXT_DOC       → 仅改 context，不打开中栏
CLEAR_CONTEXT_DOC     → contextDocId = null

发送 chat/stream:
  contextDocId → body.contextDocId
  selection.docId → contextDocId（非 activeDocId）
```

## 空态布局

```text
┌─────────────────────────────┐
│ 选择参考笔记                 │
│ ┌─────────────────────────┐ │
│ │ ○ 未命名笔记             │ │
│ │ ● RAG 架构核心要点       │ │
│ └─────────────────────────┘ │
│ 选定后在下方输入问题          │
├─────────────────────────────┤
│ [参考：RAG… ▾]  composer     │
└─────────────────────────────┘
```

- 无笔记：提示「左侧新建笔记」
- 移除：DeepSeek 大图标 + 「围绕「xxx」提问」主标题

## Composer ContextRefBar

- `contextDocId` 存在时显示：**参考：{title} ▾** + × 清除
- ▾ 打开 portal 笔记单选（与 ScopeDropdown 同模式）
- 与 Pick 选区条可并存（选区条在下）

## AI 黑字

| 项 | 改法 |
|----|------|
| `MarkdownRender` | `dark={isDarkTheme}`，`light` 时 `false` |
| `styles.css` | 删除 `strong { #fff }`，改 `var(--ink)` |
| `markstream-light.css` | 补 `strong/em/table` light 规则 |
| cite-chip | 硬编码 `#5786FE`/`#b4b4b4` → token |

## 验收标准

### 一票否决

| ID | 标准 |
|----|------|
| CV1 | 空态显示可点击笔记列表，选中后 `contextDocId` 更新 |
| CV2 | 未打开中栏笔记，仍可在右栏选参考并发送问题 |
| CV3 | composer 上方常驻「参考：标题」条（有 context 时） |
| CV4 | light 主题下 AI 回答 **strong/正文** 均为深色可读 |

### 行为性（B）

| ID | 标准 |
|----|------|
| CB1 | 左栏打开 note → context 同步为该 note |
| CB2 | `SET_CONTEXT_DOC` 不触发中栏切换 |
| CB3 | 清除参考后 placeholder 变为「请先选择参考笔记」 |

### 数据性（D）

| ID | 标准 |
|----|------|
| CD1 | `POST /api/chat/stream` body 的 `contextDocId` 来自 store.contextDocId |

## 文件索引

| 路径 | 动作 |
|------|------|
| `web/src/workspace/types.ts` | +SET_CONTEXT_DOC / CLEAR_CONTEXT_DOC |
| `web/src/workspace/WorkspaceStore.tsx` | +contextDocId/Title |
| `web/src/workspace/ReferenceNotePicker.tsx` | 新建 |
| `web/src/workspace/ContextRefBar.tsx` | 新建 |
| `web/src/workspace/ChatPane.tsx` | 空态 + API + ContextRefBar |
| `web/src/theme/useMarkstreamDark.ts` | 新建 |
| `web/src/styles.css` | strong/cite 修复 |
| `web/src/theme/markstream-light.css` | 补 strong |
| `web/src/workspace/layout.css` | picker/ref-bar 样式 |
