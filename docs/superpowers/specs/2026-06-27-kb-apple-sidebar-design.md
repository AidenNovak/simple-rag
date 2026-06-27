# private-kb Apple 风左栏 + 顶栏精简 — 设计规格

> 代码库：`/Users/lijixiang/ZCodeProject/private-kb`  
> 品牌：**meimaobing**（仅左栏，全局 topbar 不重复）

## 问题

1. 右栏头「0 篇」：`readyCount` 只计 `status=ready`，pending 笔记不计入，与左栏 4 篇笔记矛盾  
2. **无法新对话**：`FileTree` 无「新建对话」；`ws:convo-created` 未刷新列表  
3. 左栏顶 **大块琥珀「新建笔记」** + emoji 分组，视觉粗糙  
4. 笔记行与对话行 **同时 `.active`**，像 UI bug  
5. 全局 topbar 与左栏 **品牌重复**

## 目标

Apple Notes / Finder sidebar 气质：左栏品牌 **meimaobing**、section 标题 + trailing `+`、无顶栏大按钮；修复计数与新对话；topbar 仅工具（主题/邮箱/设置）。

## 非目标

- 改三栏 grid 宽度逻辑  
- 改 SSE / 后端  
- Activity Bar / 第四栏

## 左栏结构

```text
┌─────────────────────────┐
│ meimaobing              │  ws-sidebar-brand
├─────────────────────────┤
│ 笔记                 +  │  → createNote
│   ○ 未命名笔记    ⏳    │
│   ○ RAG 架构…          │
├─────────────────────────┤
│ 对话                 +  │  → SET_CONVO(null)
│   ● 你好我是知识助手    │  active-convo
├─────────────────────────┤
│ 文件                 ↑  │  → upload（有文件时显示）
└─────────────────────────┘
```

- 删除 `ws-tree-actions` 整块  
- Section 标签：**无 emoji**，11px uppercase  
- `+` / `↑`：`icon-btn` 28×28，非实心 `.btn`

## Active 分层

| 类名 | 条件 | 视觉 |
|------|------|------|
| `active-doc` | `activeDocId === id` | 浅底 + 2px 琥珀 inset（编辑上下文） |
| `active-convo` | `convoId === id` | 浅底 + 2px inset + font-weight 500（对话上下文） |

二者可同时存在，但 **对话 active 更明显**。

## 文档计数（右栏头）

- `noteTotal`：全部 `kind=note` 数量（任意 status）  
- `readyCount`：`status=ready` 数量（可检索）  
- 展示：`{noteTotal} 笔记 · {readyCount} 可检索`；若相等则 `{readyCount} 篇可检索`  
- **ReferenceNotePicker**：全部 note（含 pending）可选为参考  
- **ScopeDropdown**：仍仅 `ready` 文档（检索语义不变）  
- `noDocs`：`listDocs` 总数为 0 才禁用发送（有 pending 笔记可问）

## 顶栏

`WorkspaceShell` topbar **删除** `私人知识库` / `ws-title`，保留：

`[spacer] ThemeToggle · email · 设置`

## 验收标准

### 一票否决

| ID | 标准 |
|----|------|
| SV1 | 左栏顶显示 **meimaobing**，无「新建笔记」大按钮 |
| SV2 | 对话 section 有 `+`，点击后 `convoId=null`、右栏空态 |
| SV3 | 4 篇 pending 笔记时，右栏头 **≠「0 篇」**（显示笔记总数） |
| SV4 | 全局 topbar **无**品牌文案 |

### 行为性（B）

| ID | 标准 |
|----|------|
| SB1 | 首条消息创建会话后，左栏对话列表出现新项 |
| SB2 | 参考笔记列表含 pending 笔记 |

## 文件索引

| 路径 | 动作 |
|------|------|
| `web/src/workspace/SidebarSection.tsx` | 新建 |
| `web/src/workspace/FileTree.tsx` | 重构 |
| `web/src/workspace/WorkspaceShell.tsx` | 删 topbar 品牌 |
| `web/src/workspace/ChatPane.tsx` | 计数 + refNotes |
| `web/src/workspace/layout.css` | Apple sidebar CSS |
