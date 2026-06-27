# private-kb Apple 风左栏 + 顶栏精简 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 左栏改为 Apple Notes 式（品牌 meimaobing、section + 图标按钮），恢复新对话，修复「0 篇」计数；全局 topbar 去掉品牌只留工具。

**Architecture:** 新建 `SidebarSection` 复用 section 头；`FileTree` 删除 `ws-tree-actions`；`newConvo` + `ws:convo-created` 刷新；`ChatPane` 拆分 noteTotal/readyCount；CSS 分层 `active-doc` / `active-convo`。

**Tech Stack:** React 18 · Vitest · CSS

**Spec:** `docs/superpowers/specs/2026-06-27-kb-apple-sidebar-design.md`

**Repo:** `/Users/lijixiang/ZCodeProject/private-kb`

---

## 文件结构（锁定）

| 文件 | 职责 |
|------|------|
| `web/src/workspace/SidebarSection.tsx` | section 标题 + trailing action |
| `web/src/workspace/FileTree.tsx` | 品牌头、分区列表、新对话 |
| `web/src/workspace/WorkspaceShell.tsx` | topbar 无品牌 |
| `web/src/workspace/ChatPane.tsx` | 计数文案、refNotes、noDocs |
| `web/src/workspace/layout.css` | sidebar Apple 样式 |
| `web/src/workspace/__tests__/SidebarSection.test.tsx` | section 单测 |
| `web/src/workspace/__tests__/FileTree.test.tsx` | 更新 |

---

### Task 1: SidebarSection 组件

**Files:**
- Create: `web/src/workspace/SidebarSection.tsx`
- Create: `web/src/workspace/__tests__/SidebarSection.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
// web/src/workspace/__tests__/SidebarSection.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { SidebarSection } from "../SidebarSection.js";

describe("SidebarSection", () => {
  it("renders title and calls action", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <SidebarSection title="笔记" actionLabel="新建笔记" onAction={onAction}>
        <li>child</li>
      </SidebarSection>
    );
    expect(screen.getByText("笔记")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "新建笔记" }));
    expect(onAction).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run web:test -- web/src/workspace/__tests__/SidebarSection.test.tsx`

Expected: FAIL — module not found

- [ ] **Step 3: 实现**

```tsx
// web/src/workspace/SidebarSection.tsx
import type { ReactNode } from "react";

interface Props {
  title: string;
  actionLabel: string;
  onAction?: () => void;
  actionIcon?: ReactNode;
  children: ReactNode;
}

export function SidebarSection({ title, actionLabel, onAction, actionIcon, children }: Props) {
  return (
    <section className="ws-sidebar-section" data-testid={`sidebar-section-${title}`}>
      <div className="ws-sidebar-section-head">
        <h2 className="ws-sidebar-section-title">{title}</h2>
        {onAction && (
          <button type="button" className="icon-btn ws-sidebar-section-action" aria-label={actionLabel} onClick={onAction}>
            {actionIcon ?? "+"}
          </button>
        )}
      </div>
      <ul className="ws-sidebar-section-list">{children}</ul>
    </section>
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run web:test -- web/src/workspace/__tests__/SidebarSection.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/workspace/SidebarSection.tsx web/src/workspace/__tests__/SidebarSection.test.tsx
git commit -m "feat(sidebar): add SidebarSection with trailing action"
```

---

### Task 2: FileTree Apple 重构 + 新对话

**Files:**
- Modify: `web/src/workspace/FileTree.tsx`
- Modify: `web/src/workspace/__tests__/FileTree.test.tsx`

- [ ] **Step 1: 更新失败测试**

```tsx
// web/src/workspace/__tests__/FileTree.test.tsx — 替换 create-note 测试并追加
vi.mock("../../api.js", () => ({
  api: {
    listDocs: vi.fn().mockResolvedValue({
      documents: [
        { id: "n1", title: "My Note", kind: "note", status: "pending", createdAt: "2026-01-01" },
      ],
    }),
    listConversations: vi.fn().mockResolvedValue({
      conversations: [{ id: "c1", title: "Hello" }],
    }),
    getDoc: vi.fn().mockResolvedValue({ document: { id: "n1", title: "My Note", contentMd: "# Hi", kind: "note" } }),
    createNote: vi.fn().mockResolvedValue({ document: { id: "n2", title: "未命名笔记", status: "pending", createdAt: "2026-01-02" } }),
    upload: vi.fn(),
    deleteDoc: vi.fn(),
  },
  getToken: () => "x",
}));

it("shows meimaobing brand without top create button", async () => {
  render(<WorkspaceProvider><FileTree /></WorkspaceProvider>);
  expect(await screen.findByText("meimaobing")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /新建笔记$/ })).toBeNull();
});

it("new conversation via section + button", async () => {
  const user = userEvent.setup();
  render(<WorkspaceProvider><FileTree /></WorkspaceProvider>);
  await screen.findByText("Hello");
  await user.click(screen.getByRole("button", { name: "新建对话" }));
  // convo row 不应再 active（store convoId null）— 通过 data 属性或缺 active-convo 测
  expect(document.querySelector(".ws-tree-row.active-convo")).toBeNull();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run web:test -- web/src/workspace/__tests__/FileTree.test.tsx`

Expected: FAIL

- [ ] **Step 3: 重写 FileTree 关键结构**

```tsx
// FileTree.tsx — imports 追加
import { SidebarSection } from "./SidebarSection.js";
import { IconUpload } from "../Icons.js";

// useEffect 追加 convo 刷新：
useEffect(() => {
  const onCreated = () => { load(); };
  window.addEventListener("ws:convo-created", onCreated);
  return () => window.removeEventListener("ws:convo-created", onCreated);
}, []);

const newConvo = () => dispatch({ type: "SET_CONVO", payload: null });

// Row className 改为：
className={`ws-tree-row${state.activeDocId === d.id ? " active-doc" : ""}`}

// convo row:
className={`ws-tree-row ws-tree-row-convo${state.convoId === c.id ? " active-convo" : ""}`}

// return JSX 替换 ws-tree-actions 整块：
return (
  <div className="ws-filetree" data-testid="file-tree">
    <div className="ws-sidebar-brand">meimaobing</div>

    <SidebarSection title="笔记" actionLabel="新建笔记" onAction={newNote}>
      {notes.map((d) => (
        <li key={d.id}><Row d={d} /></li>
      ))}
    </SidebarSection>

    <SidebarSection title="对话" actionLabel="新建对话" onAction={newConvo}>
      {convos.map((c) => (
        <li key={c.id}>
          <div className={`ws-tree-row ws-tree-row-convo${state.convoId === c.id ? " active-convo" : ""}`}
            onClick={() => openConvo(c.id)} title={c.title}>
            <span className="ws-tree-label">{c.title}</span>
          </div>
        </li>
      ))}
    </SidebarSection>

    {files.length > 0 && (
      <SidebarSection title="文件" actionLabel="上传文件" onAction={() => fileInput.current?.click()} actionIcon={<IconUpload size={14} />}>
        {files.map((d) => <li key={d.id}><Row d={d} /></li>)}
      </SidebarSection>
    )}

    <input ref={fileInput} type="file" style={{ display: "none" }} accept="..." onChange={...} />
    {loading && <div className="muted ws-sidebar-loading">加载中…</div>}
    {!loading && docs.length === 0 && convos.length === 0 && (
      <div className="muted ws-sidebar-empty">空空如也</div>
    )}
  </div>
);
```

`newNote` 成功后同步 `SET_CONTEXT_DOC`（若已有 context plan）：

```tsx
dispatch({ type: "SET_ACTIVE_DOC", payload: { id: doc.id, title: doc.title, content: "（开始编辑…）", kind: "note" } });
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run web:test -- web/src/workspace/__tests__/FileTree.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/workspace/FileTree.tsx web/src/workspace/__tests__/FileTree.test.tsx
git commit -m "feat(sidebar): apple FileTree with meimaobing brand and new chat"
```

---

### Task 3: 顶栏去掉品牌

**Files:**
- Modify: `web/src/workspace/WorkspaceShell.tsx`
- Modify: `web/src/workspace/__tests__/WorkspaceShell.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
// 追加到 WorkspaceShell.test.tsx 或新建
it("topbar has no duplicate brand title", () => {
  render(<WorkspaceProvider><WorkspaceShell user={{ email: "a@b.c" }} onOpenSettings={() => {}} /></WorkspaceProvider>);
  expect(screen.queryByText("私人知识库")).toBeNull();
  expect(screen.queryByText("meimaobing")).toBeNull();
});
```

- [ ] **Step 2: 修改 WorkspaceShell**

```tsx
topbar={
  <>
    <span style={{ marginLeft: "auto" }} />
    <ThemeToggle />
    <span className="muted" style={{ fontSize: 13 }}>{user.email}</span>
    <button type="button" className="btn-secondary" style={{ padding: "4px 12px", fontSize: 13 }} onClick={onOpenSettings}>设置</button>
  </>
}
```

- [ ] **Step 3: 运行测试 + commit**

Run: `npm run web:test -- web/src/workspace/__tests__/WorkspaceShell.test.tsx`

```bash
git add web/src/workspace/WorkspaceShell.tsx web/src/workspace/__tests__/WorkspaceShell.test.tsx
git commit -m "refactor(topbar): remove brand; meimaobing lives in left sidebar only"
```

---

### Task 4: ChatPane 计数与 refNotes 修复

**Files:**
- Modify: `web/src/workspace/ChatPane.tsx`
- Create: `web/src/workspace/__tests__/ChatPaneDocCount.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
// web/src/workspace/__tests__/ChatPaneDocCount.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { WorkspaceProvider } from "../WorkspaceStore.js";
import { ChatPane } from "../ChatPane.js";

vi.mock("../../api.js", () => ({
  api: {
    listDocs: vi.fn().mockResolvedValue({
      documents: [
        { id: "n1", title: "A", kind: "note", status: "pending" },
        { id: "n2", title: "B", kind: "note", status: "pending" },
      ],
    }),
    getMessages: vi.fn().mockResolvedValue({ messages: [] }),
  },
  getToken: () => "t",
}));
vi.mock("markstream-react", () => ({ default: () => null, TextNode: () => null }));
vi.mock("../../components/Toast.js", () => ({ useToast: () => () => {} }));
vi.mock("../ScopeDropdown.js", () => ({ ScopeDropdown: () => null }));
vi.mock("../FilePeekPanel.js", () => ({ FilePeekPanel: () => null }));

describe("ChatPane doc count", () => {
  it("shows note total when none ready", async () => {
    render(<WorkspaceProvider><ChatPane /></WorkspaceProvider>);
    expect(await screen.findByText(/2 笔记/)).toBeInTheDocument();
    expect(screen.getByText(/0 可检索/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run web:test -- web/src/workspace/__tests__/ChatPaneDocCount.test.tsx`

Expected: FAIL — shows `0 篇`

- [ ] **Step 3: 修改 ChatPane**

```tsx
// state 追加
const [noteTotal, setNoteTotal] = useState<number | null>(null);

// listDocs effect 改为：
useEffect(() => {
  api.listDocs().then((r) => {
    const docs = r.documents || [];
    const ready = docs.filter((d: any) => d.status === "ready");
    const notes = docs.filter((d: any) => d.kind === "note");
    setReadyCount(ready.length);
    setNoteTotal(notes.length);
    setAllDocs(ready);
  }).catch(() => {});
}, [messages.length]);

const noDocs = noteTotal !== null && noteTotal === 0 && (allDocs.length === 0);

const refNotes = /* 单独拉全量 notes，或在 effect 里 cache allNotesList */;
// 实现：增加 allNotes state，listDocs 时 setAllNotes(notes.map...)
const refNotes = allNotes.map((d) => ({ id: d.id, title: d.title }));

// header 计数替换：
{noteTotal !== null && readyCount !== null && (
  <span className="muted ws-doc-count" style={{ fontSize: 12 }}>
    {noteTotal === readyCount
      ? `${readyCount} 篇可检索`
      : `${noteTotal} 笔记 · ${readyCount} 可检索`}
  </span>
)}
```

完整 `allNotes` state：

```tsx
const [allNotes, setAllNotes] = useState<{ id: string; title: string }[]>([]);
// in effect:
const notes = docs.filter((d: any) => d.kind === "note");
setAllNotes(notes.map((d: any) => ({ id: d.id, title: d.title })));
const refNotes = allNotes;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run web:test -- web/src/workspace/__tests__/ChatPaneDocCount.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/workspace/ChatPane.tsx web/src/workspace/__tests__/ChatPaneDocCount.test.tsx
git commit -m "fix(chat): show note total vs ready count in header"
```

---

### Task 5: Apple sidebar CSS

**Files:**
- Modify: `web/src/workspace/layout.css`

- [ ] **Step 1: 写失败测试**

```typescript
// web/src/workspace/__tests__/sidebarStyles.test.ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";

describe("apple sidebar css", () => {
  it("defines brand and active-doc/active-convo", () => {
    const css = fs.readFileSync("web/src/workspace/layout.css", "utf8");
    expect(css).toContain(".ws-sidebar-brand");
    expect(css).toContain(".active-doc");
    expect(css).toContain(".active-convo");
    expect(css).not.toContain(".ws-tree-actions");
  });
});
```

- [ ] **Step 2: 替换 layout.css 左栏块**

删除 `.ws-tree-actions`、旧 `.ws-tree-group-label` emoji 样式；追加：

```css
.ws-sidebar-brand {
  padding: 14px 12px 10px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--ink);
}
.ws-sidebar-section { margin-bottom: 16px; }
.ws-sidebar-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 6px;
}
.ws-sidebar-section-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-muted);
}
.ws-sidebar-section-action {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  font-size: 16px;
  line-height: 1;
  color: var(--ink-secondary);
}
.ws-sidebar-section-action:hover {
  background: var(--bg-hover);
  color: var(--ink);
}
.ws-sidebar-section-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.ws-filetree { padding: 0 6px 12px; }
.ws-tree-row {
  min-height: 32px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 13px;
}
.ws-tree-row.active-doc {
  background: rgba(242, 140, 46, 0.08);
  box-shadow: inset 2px 0 0 rgba(180, 83, 9, 0.45);
  color: var(--ink);
}
.ws-tree-row.active-convo {
  background: rgba(26, 22, 18, 0.06);
  box-shadow: inset 2px 0 0 var(--accent-amber);
  color: var(--ink);
  font-weight: 500;
}
.ws-tree-row-convo .ws-tree-label { padding-left: 2px; }
.ws-sidebar-loading, .ws-sidebar-empty {
  padding: 16px 12px;
  font-size: 12px;
  text-align: center;
}
```

删除旧 `.ws-tree-row.active { box-shadow: inset 3px ...}` 规则避免冲突。

- [ ] **Step 3: 运行测试 + 手动冒烟**

Run: `npm run web:test -- web/src/workspace/__tests__/sidebarStyles.test.ts`

Run: `npm run web:dev` — 左栏 meimaobing、section +、无顶栏大按钮

- [ ] **Step 4: Commit**

```bash
git add web/src/workspace/layout.css web/src/workspace/__tests__/sidebarStyles.test.ts
git commit -m "style(sidebar): apple sidebar tokens and active states"
```

---

### Task 6: 集成验证 + Agent Prompts

**Files:**
- Create: `web/src/workspace/__tests__/AppleSidebar.integration.test.tsx`

- [ ] **Step 1: 集成测试**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { WorkspaceProvider } from "../WorkspaceStore.js";
import { WorkspaceLayout } from "../layout/WorkspaceLayout.js";

vi.mock("../../api.js", () => ({
  api: {
    listDocs: vi.fn().mockResolvedValue({ documents: [{ id: "n1", title: "N", kind: "note", status: "pending" }] }),
    listConversations: vi.fn().mockResolvedValue({ conversations: [{ id: "c1", title: "C" }] }),
    getMessages: vi.fn().mockResolvedValue({ messages: [] }),
    getDoc: vi.fn(),
  },
  getToken: () => "t",
}));
vi.mock("../EditorPane.js", () => ({ EditorPane: () => <div /> }));
vi.mock("../ChatPane.js", () => ({ ChatPane: () => <div data-testid="chat" /> }));
vi.mock("markstream-react", () => ({ default: () => null }));

describe("Apple sidebar integration", () => {
  it("SV1+SV4: brand in sidebar only", async () => {
    render(
      <WorkspaceProvider>
        <WorkspaceLayout topbar={<span data-testid="top">tools</span>} />
      </WorkspaceProvider>
    );
    expect(await screen.findByText("meimaobing")).toBeInTheDocument();
    expect(screen.getByTestId("top")).not.toHaveTextContent("meimaobing");
  });
});
```

- [ ] **Step 2: 全量测试**

Run: `npm run web:test`

Expected: 全部 PASS

- [ ] **Step 3: 构建**

Run: `npm run web:build`

Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add web/src/workspace/__tests__/AppleSidebar.integration.test.tsx
git commit -m "test(sidebar): apple sidebar integration coverage"
```

---

## Agent Prompts（三套）

### Prompt A — 验收

```markdown
Spec: docs/superpowers/specs/2026-06-27-kb-apple-sidebar-design.md
Plan: docs/superpowers/plans/2026-06-27-kb-apple-sidebar.md
npm run web:test && npm run web:build
验证 SV1–SV4、SB1–SB2；截图左栏 meimaobing + 对话 +
```

### Prompt B — Task 1→6 顺序实现

```markdown
严格按 docs/superpowers/plans/2026-06-27-kb-apple-sidebar.md 执行。开始 Task 1。
```

### Prompt C — 单 Task

```markdown
只执行 Apple sidebar plan Task {N}。禁止改 SSE/后端。
```

---

## Self-Review

**Spec coverage:** SV/SB 全映射 Task 1–6 ✓  
**Placeholder scan:** 无 TBD ✓  
**Type consistency:** `active-doc`/`active-convo`、`noteTotal`/`readyCount` 一致 ✓  
**Brand:** 仅左栏 **meimaobing**，topbar 无品牌 ✓
