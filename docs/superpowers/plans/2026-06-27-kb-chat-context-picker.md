# private-kb 右栏参考笔记选择 + AI 黑字 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 右栏空态可独立选择参考笔记（`contextDocId` 与 `activeDocId` 解耦），composer 常驻参考条，light 主题下 AI 回答全文黑字可读。

**Architecture:** `WorkspaceStore` 新增 `contextDocId/contextDocTitle` 与 `SET_CONTEXT_DOC`/`CLEAR_CONTEXT_DOC`；`ReferenceNotePicker` 供空态单选；`ContextRefBar` 供 composer portal 切换；`useMarkstreamDark` 驱动 `MarkdownRender dark`；清理 `strong { #fff }` 残留。

**Tech Stack:** React 18 · Vitest · Testing Library · CSS variables

**Spec:** `docs/superpowers/specs/2026-06-27-kb-chat-context-picker-design.md`

**Repo:** `/Users/lijixiang/ZCodeProject/private-kb`

---

## 文件结构（锁定）

| 文件 | 职责 |
|------|------|
| `web/src/workspace/types.ts` | Context action 类型 |
| `web/src/workspace/WorkspaceStore.tsx` | contextDocId/Title reducer |
| `web/src/workspace/ReferenceNotePicker.tsx` | 空态笔记单选列表 |
| `web/src/workspace/ContextRefBar.tsx` | composer 参考条 + portal |
| `web/src/workspace/ChatPane.tsx` | 空态/API/selection 绑定 context |
| `web/src/theme/useMarkstreamDark.ts` | 读 `data-theme` |
| `web/src/styles.css` | cite/strong 硬编码清理 |
| `web/src/theme/markstream-light.css` | strong 等 light 规则 |
| `web/src/workspace/layout.css` | picker + ref-bar 样式 |

---

## Spec → Task 映射

| 验收 ID | Task |
|---------|------|
| CV1, CV2, CB2 | Task 2, 4 |
| CV3, CB3 | Task 3, 4 |
| CV4 | Task 5 |
| CB1, CD1 | Task 1, 4 |
| 样式 | Task 6 |

---

### Task 1: WorkspaceStore contextDocId

**Files:**
- Modify: `web/src/workspace/types.ts`
- Modify: `web/src/workspace/WorkspaceStore.tsx`
- Modify: `web/src/workspace/__tests__/WorkspaceStore.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// 追加到 web/src/workspace/__tests__/WorkspaceStore.test.ts
it("SET_CONTEXT_DOC updates context without activeDoc", () => {
  const s = workspaceReducer(initialWorkspaceState, {
    type: "SET_CONTEXT_DOC",
    payload: { id: "n9", title: "Ref Note" },
  });
  expect(s.contextDocId).toBe("n9");
  expect(s.contextDocTitle).toBe("Ref Note");
  expect(s.activeDocId).toBeNull();
});

it("SET_ACTIVE_DOC note syncs contextDocId", () => {
  const s = workspaceReducer(initialWorkspaceState, {
    type: "SET_ACTIVE_DOC",
    payload: { id: "d2", title: "T", content: "c", kind: "note" },
  });
  expect(s.contextDocId).toBe("d2");
  expect(s.contextDocTitle).toBe("T");
});

it("SET_ACTIVE_DOC upload does not change contextDocId", () => {
  const withCtx = workspaceReducer(initialWorkspaceState, {
    type: "SET_CONTEXT_DOC",
    payload: { id: "n1", title: "Keep" },
  });
  const s = workspaceReducer(withCtx, {
    type: "SET_ACTIVE_DOC",
    payload: { id: "f1", title: "File", content: "", kind: "upload" },
  });
  expect(s.contextDocId).toBe("n1");
  expect(s.activeDocId).toBe("f1");
});

it("CLEAR_CONTEXT_DOC clears context fields", () => {
  const withCtx = workspaceReducer(initialWorkspaceState, {
    type: "SET_CONTEXT_DOC",
    payload: { id: "n1", title: "X" },
  });
  const s = workspaceReducer(withCtx, { type: "CLEAR_CONTEXT_DOC" });
  expect(s.contextDocId).toBeNull();
  expect(s.contextDocTitle).toBeNull();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run web:test -- web/src/workspace/__tests__/WorkspaceStore.test.ts`

Expected: FAIL — `SET_CONTEXT_DOC` not in union

- [ ] **Step 3: 实现 types + reducer**

```typescript
// web/src/workspace/types.ts — 追加到 WorkspaceAction
| { type: "SET_CONTEXT_DOC"; payload: { id: string; title: string } }
| { type: "CLEAR_CONTEXT_DOC" }
```

```typescript
// web/src/workspace/WorkspaceStore.tsx — WorkspaceState 追加
contextDocId: string | null;
contextDocTitle: string | null;

// initialWorkspaceState
contextDocId: null,
contextDocTitle: null,

// SET_ACTIVE_DOC case 改为：
case "SET_ACTIVE_DOC": {
  const base = {
    ...state,
    activeDocId: action.payload.id,
    activeDocKind: action.payload.kind,
    draftTitle: action.payload.title,
    draftContent: action.payload.content,
    dirty: false,
    selection: null,
    scopeDocIds: [action.payload.id],
  };
  if (action.payload.kind === "note") {
    return {
      ...base,
      contextDocId: action.payload.id,
      contextDocTitle: action.payload.title,
    };
  }
  return base;
}
case "SET_CONTEXT_DOC":
  return {
    ...state,
    contextDocId: action.payload.id,
    contextDocTitle: action.payload.title,
  };
case "CLEAR_CONTEXT_DOC":
  return { ...state, contextDocId: null, contextDocTitle: null };
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run web:test -- web/src/workspace/__tests__/WorkspaceStore.test.ts`

Expected: 9 tests PASS（原 5 + 新 4）

- [ ] **Step 5: Commit**

```bash
git add web/src/workspace/types.ts web/src/workspace/WorkspaceStore.tsx \
  web/src/workspace/__tests__/WorkspaceStore.test.ts
git commit -m "feat(workspace): add contextDocId independent of activeDoc"
```

---

### Task 2: ReferenceNotePicker 组件

**Files:**
- Create: `web/src/workspace/ReferenceNotePicker.tsx`
- Create: `web/src/workspace/__tests__/ReferenceNotePicker.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
// web/src/workspace/__tests__/ReferenceNotePicker.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ReferenceNotePicker } from "../ReferenceNotePicker.js";

const NOTES = [
  { id: "n1", title: "未命名笔记" },
  { id: "n2", title: "RAG 架构核心要点" },
];

describe("ReferenceNotePicker", () => {
  it("renders note list and calls onSelect", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ReferenceNotePicker notes={NOTES} selectedId="n1" onSelect={onSelect} />);
    expect(screen.getByTestId("ref-note-picker")).toBeInTheDocument();
    expect(screen.getByText("选择参考笔记")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /RAG 架构核心要点/ }));
    expect(onSelect).toHaveBeenCalledWith("n2", "RAG 架构核心要点");
  });

  it("shows empty hint when no notes", () => {
    render(<ReferenceNotePicker notes={[]} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText(/左侧新建笔记/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run web:test -- web/src/workspace/__tests__/ReferenceNotePicker.test.tsx`

Expected: FAIL — module not found

- [ ] **Step 3: 实现组件**

```tsx
// web/src/workspace/ReferenceNotePicker.tsx
export interface RefNote { id: string; title: string; }

interface Props {
  notes: RefNote[];
  selectedId: string | null;
  onSelect: (id: string, title: string) => void;
}

export function ReferenceNotePicker({ notes, selectedId, onSelect }: Props) {
  if (notes.length === 0) {
    return (
      <div className="ws-ref-picker ws-ref-picker-empty" data-testid="ref-note-picker">
        <p className="ws-ref-picker-title">选择参考笔记</p>
        <p className="muted">知识库暂无笔记，请左侧点击「新建笔记」</p>
      </div>
    );
  }

  return (
    <div className="ws-ref-picker" data-testid="ref-note-picker">
      <h2 className="ws-ref-picker-title">选择参考笔记</h2>
      <ul className="ws-ref-picker-list" role="listbox" aria-label="参考笔记">
        {notes.map((n) => {
          const active = selectedId === n.id;
          return (
            <li key={n.id} role="option" aria-selected={active}>
              <button
                type="button"
                className={`ws-ref-picker-row${active ? " active" : ""}`}
                onClick={() => onSelect(n.id, n.title)}
              >
                <span className="ws-ref-picker-dot" aria-hidden>{active ? "●" : "○"}</span>
                <span className="ws-ref-picker-label">{n.title}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="ws-ref-picker-hint muted">选定后在下方输入问题；中栏 Pick 可带入段落</p>
    </div>
  );
}
```

- [ ] **Step 4: layout.css 追加样式**

```css
.ws-ref-picker { padding: 8px 4px 16px; max-width: 320px; width: 100%; }
.ws-ref-picker-title { font-size: 15px; font-weight: 600; color: var(--ink); margin-bottom: 12px; }
.ws-ref-picker-list { list-style: none; display: flex; flex-direction: column; gap: 4px; }
.ws-ref-picker-row {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 10px 12px; border-radius: 10px; text-align: left;
  font-size: 14px; color: var(--ink-secondary);
  border: 1px solid transparent; transition: background 0.15s, border-color 0.15s;
}
.ws-ref-picker-row:hover { background: var(--bg-hover); color: var(--ink); }
.ws-ref-picker-row.active {
  background: rgba(242, 140, 46, 0.1);
  border-color: rgba(180, 83, 9, 0.25);
  color: var(--ink);
}
.ws-ref-picker-dot { width: 14px; flex-shrink: 0; color: var(--accent-amber); font-size: 12px; }
.ws-ref-picker-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ws-ref-picker-hint { font-size: 12px; margin-top: 12px; line-height: 1.5; }
.ws-ref-picker-empty { text-align: center; padding: 24px 12px; }
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run web:test -- web/src/workspace/__tests__/ReferenceNotePicker.test.tsx`

Expected: 2 tests PASS

- [ ] **Step 6: Commit**

```bash
git add web/src/workspace/ReferenceNotePicker.tsx \
  web/src/workspace/__tests__/ReferenceNotePicker.test.tsx \
  web/src/workspace/layout.css
git commit -m "feat(chat): add ReferenceNotePicker for empty state"
```

---

### Task 3: ContextRefBar 组件

**Files:**
- Create: `web/src/workspace/ContextRefBar.tsx`
- Create: `web/src/workspace/__tests__/ContextRefBar.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
// web/src/workspace/__tests__/ContextRefBar.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ContextRefBar } from "../ContextRefBar.js";

const NOTES = [{ id: "n1", title: "A" }, { id: "n2", title: "B" }];

describe("ContextRefBar", () => {
  it("shows reference title and opens menu", async () => {
    const user = userEvent.setup();
    render(
      <ContextRefBar
        title="A"
        selectedId="n1"
        notes={NOTES}
        onSelect={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.getByTestId("context-ref-bar")).toHaveTextContent("参考：A");
    await user.click(screen.getByRole("button", { name: /更换参考笔记/ }));
    expect(document.body.querySelector(".ws-ref-portal")).toBeTruthy();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run web:test -- web/src/workspace/__tests__/ContextRefBar.test.tsx`

Expected: FAIL

- [ ] **Step 3: 实现 ContextRefBar**

```tsx
// web/src/workspace/ContextRefBar.tsx
import { createPortal } from "react-dom";
import { useLayoutEffect, useRef, useState } from "react";
import { IconNote } from "../Icons.js";
import type { RefNote } from "./ReferenceNotePicker.js";

interface Props {
  title: string;
  selectedId: string;
  notes: RefNote[];
  onSelect: (id: string, title: string) => void;
  onClear: () => void;
}

export function ContextRefBar({ title, selectedId, notes, onSelect, onClear }: Props) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 280 });

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: Math.max(260, r.width) });
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  return (
    <div ref={anchorRef} className="ws-context-ref-bar" data-testid="context-ref-bar">
      <IconNote size={12} />
      <span className="ws-context-ref-label">参考：{title}</span>
      <button
        type="button"
        className="ws-context-ref-change"
        aria-label="更换参考笔记"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      >
        ▾
      </button>
      <button type="button" className="ws-context-clear" aria-label="清除参考笔记" onClick={onClear}>×</button>
      {open && createPortal(
        <div
          className="ws-ref-portal model-dropdown"
          style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 5000 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-muted)" }}>更换参考笔记</div>
          {notes.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`scope-item${n.id === selectedId ? " active" : ""}`}
              style={{ display: "flex", width: "100%", textAlign: "left" }}
              onClick={() => { onSelect(n.id, n.title); setOpen(false); }}
            >
              {n.id === selectedId ? "● " : "○ "}{n.title}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
```

- [ ] **Step 4: layout.css 追加**

```css
.ws-context-ref-bar {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 12px; margin-bottom: 6px;
  background: var(--selection-bar-bg);
  border: 1px solid var(--border);
  border-radius: 8px; font-size: 12px; color: var(--ink-secondary);
}
.ws-context-ref-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); }
.ws-context-ref-change { color: var(--accent-amber); padding: 0 4px; font-size: 11px; }
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run web:test -- web/src/workspace/__tests__/ContextRefBar.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add web/src/workspace/ContextRefBar.tsx web/src/workspace/__tests__/ContextRefBar.test.tsx \
  web/src/workspace/layout.css
git commit -m "feat(chat): add ContextRefBar with portal note switcher"
```

---

### Task 4: ChatPane 集成

**Files:**
- Modify: `web/src/workspace/ChatPane.tsx`
- Modify: `web/src/workspace/__tests__/ChatPaneWorkspace.test.tsx`

- [ ] **Step 1: 更新失败测试**

```tsx
// 替换 web/src/workspace/__tests__/ChatPaneWorkspace.test.tsx 全文
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { WorkspaceProvider, useWorkspace } from "../WorkspaceStore.js";
import { ChatPane } from "../ChatPane.js";
import { useEffect } from "react";

vi.mock("../../api.js", () => ({
  api: {
    listDocs: vi.fn().mockResolvedValue({
      documents: [
        { id: "n1", title: "Note A", kind: "note", status: "ready" },
        { id: "n2", title: "Note B", kind: "note", status: "ready" },
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

describe("ChatPane context picker", () => {
  it("empty state shows reference note picker", async () => {
    render(<WorkspaceProvider><ChatPane /></WorkspaceProvider>);
    expect(await screen.findByTestId("ref-note-picker")).toBeInTheDocument();
    expect(screen.getByText("选择参考笔记")).toBeInTheDocument();
  });

  it("selecting note sets context without requiring activeDoc", async () => {
    const user = userEvent.setup();
    render(<WorkspaceProvider><ChatPane /></WorkspaceProvider>);
    await user.click(await screen.findByRole("button", { name: /Note B/ }));
    expect(screen.getByTestId("context-ref-bar")).toHaveTextContent("参考：Note B");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run web:test -- web/src/workspace/__tests__/ChatPaneWorkspace.test.tsx`

Expected: FAIL

- [ ] **Step 3: 修改 ChatPane.tsx 关键片段**

**imports 追加：**
```tsx
import { ReferenceNotePicker } from "./ReferenceNotePicker.js";
import { ContextRefBar } from "./ContextRefBar.js";
```

**在组件内追加 notes 过滤：**
```tsx
const refNotes = allDocs
  .filter((d: any) => d.kind === "note" && d.status === "ready")
  .map((d: any) => ({ id: d.id, title: d.title }));
```

**runAsk 内改为 contextDocId：**
```tsx
const ctxId = state.contextDocId;
const selection = selText && ctxId
  ? { docId: ctxId, text: selText, start: state.selection?.start, end: state.selection?.end }
  : undefined;
// body:
...(ctxId ? { contextDocId: ctxId } : {}),
```

**空态 JSX 替换（删除 DeepSeek 大图标 + 围绕 xxx）：**
```tsx
{isEmpty ? (
  <div className="chat-empty ws-chat-empty">
    <ReferenceNotePicker
      notes={refNotes}
      selectedId={state.contextDocId}
      onSelect={(id, title) => dispatch({ type: "SET_CONTEXT_DOC", payload: { id, title } })}
    />
  </div>
) : ( /* chat-stream 不变 */ )}
```

**composer-stack 内，选区条之前插入 ContextRefBar：**
```tsx
{state.contextDocId && state.contextDocTitle && (
  <ContextRefBar
    title={state.contextDocTitle}
    selectedId={state.contextDocId}
    notes={refNotes}
    onSelect={(id, title) => dispatch({ type: "SET_CONTEXT_DOC", payload: { id, title } })}
    onClear={() => dispatch({ type: "CLEAR_CONTEXT_DOC" })}
  />
)}
```

**placeholder 改为：**
```tsx
placeholder={
  state.contextDocId
    ? `关于「${state.contextDocTitle}」提问…`
    : noDocs ? "先新建笔记或上传文档…" : "请先选择参考笔记"
}
```

**send 按钮 disabled 条件可选加 `!state.contextDocId`（YAGNI：允许无参考纯库内问答则不加；spec 要求选参考 → 加上）：**
```tsx
disabled={!input.trim() || noDocs || !state.contextDocId}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run web:test -- web/src/workspace/__tests__/ChatPaneWorkspace.test.tsx`

Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/workspace/ChatPane.tsx web/src/workspace/__tests__/ChatPaneWorkspace.test.tsx
git commit -m "feat(chat): wire contextDocId picker and ContextRefBar in ChatPane"
```

---

### Task 5: AI 回答黑字修复

**Files:**
- Create: `web/src/theme/useMarkstreamDark.ts`
- Modify: `web/src/workspace/ChatPane.tsx`
- Modify: `web/src/styles.css`
- Modify: `web/src/theme/markstream-light.css`
- Create: `web/src/theme/__tests__/inkText.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// web/src/theme/__tests__/inkText.test.ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";

describe("AI ink text CSS", () => {
  it("styles.css does not force white strong text globally", () => {
    const css = fs.readFileSync("web/src/styles.css", "utf8");
    expect(css).not.toMatch(/\.markstream-react strong\s*\{[^}]*#fff/s);
  });

  it("markstream-light.css sets strong to ink", () => {
    const css = fs.readFileSync("web/src/theme/markstream-light.css", "utf8");
    expect(css).toContain(".markstream-react strong");
    expect(css).toContain("var(--ink)");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run web:test -- web/src/theme/__tests__/inkText.test.ts`

Expected: FAIL on first assertion

- [ ] **Step 3: useMarkstreamDark + ChatPane**

```typescript
// web/src/theme/useMarkstreamDark.ts
import { useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  const h = () => cb();
  window.addEventListener("kb:theme-changed", h);
  return () => window.removeEventListener("kb:theme-changed", h);
}

export function useMarkstreamDark(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.theme === "dark",
    () => false
  );
}
```

```tsx
// ChatPane.tsx
import { useMarkstreamDark } from "../theme/useMarkstreamDark.js";
// 组件内：
const markstreamDark = useMarkstreamDark();
// MarkdownRender:
<MarkdownRender content={normalizeMath(m.content)} final={!m.loading} fade={false} dark={markstreamDark} customComponents={MARKSTREAM_CUSTOM} />
```

**styles.css 替换 L268-269：**
```css
.markstream-react strong { color: var(--ink) !important; }
[data-theme="dark"] .markstream-react strong { color: var(--text) !important; }
.markstream-react em { color: var(--ink-secondary) !important; }
[data-theme="dark"] .markstream-react em { color: var(--text) !important; }
```

**cite-chip 改 token（styles.css）：**
```css
.cite-chip .cite-n {
  color: var(--accent-amber);
  background: var(--cite-bg);
}
.cite-chip .cite-title { color: var(--ink-secondary); }
```

**markstream-light.css 末尾追加：**
```css
[data-theme="light"] .markstream-react strong,
:root:not([data-theme="dark"]) .markstream-react strong {
  color: var(--ink) !important;
}
[data-theme="light"] .markstream-react em,
:root:not([data-theme="dark"]) .markstream-react em {
  color: var(--ink-secondary) !important;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run web:test -- web/src/theme/__tests__/inkText.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/theme/useMarkstreamDark.ts web/src/theme/__tests__/inkText.test.ts \
  web/src/workspace/ChatPane.tsx web/src/styles.css web/src/theme/markstream-light.css
git commit -m "fix(chat): render assistant markdown with ink text on light paper"
```

---

### Task 6: ws-context-bar 暖色 + 布局微调

**Files:**
- Modify: `web/src/workspace/layout.css`

- [ ] **Step 1: 替换 ws-context-bar 硬编码蓝底**

```css
.ws-context-bar {
  background: var(--selection-bar-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
}
.ws-chat-empty {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  padding: 20px 16px;
  height: 100%;
}
```

- [ ] **Step 2: 手动验证空态左对齐、非居中大图标**

Run: `npm run web:dev` — 空态 picker 左对齐，无 whale 图标

- [ ] **Step 3: Commit**

```bash
git add web/src/workspace/layout.css
git commit -m "style(chat): warm paper empty state and context bar tokens"
```

---

### Task 7: 集成验证 + Agent Prompts

**Files:**
- Create: `web/src/workspace/__tests__/ChatContext.integration.test.tsx`

- [ ] **Step 1: 集成测试**

```tsx
// web/src/workspace/__tests__/ChatContext.integration.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { WorkspaceProvider } from "../WorkspaceStore.js";
import { ChatPane } from "../ChatPane.js";

vi.mock("../../api.js", () => ({
  api: {
    listDocs: vi.fn().mockResolvedValue({
      documents: [{ id: "n1", title: "Only", kind: "note", status: "ready" }],
    }),
    getMessages: vi.fn().mockResolvedValue({ messages: [] }),
  },
  getToken: () => "t",
}));
vi.mock("markstream-react", () => ({ default: () => null, TextNode: () => null }));
vi.mock("../../components/Toast.js", () => ({ useToast: () => () => {} }));
vi.mock("../ScopeDropdown.js", () => ({ ScopeDropdown: () => null }));
vi.mock("../FilePeekPanel.js", () => ({ FilePeekPanel: () => null }));

describe("Chat context integration", () => {
  it("CV1+CV3: picker selects note and shows context ref bar", async () => {
    const user = userEvent.setup();
    render(<WorkspaceProvider><ChatPane /></WorkspaceProvider>);
    await user.click(await screen.findByRole("button", { name: /Only/ }));
    expect(screen.getByTestId("context-ref-bar")).toHaveTextContent("参考：Only");
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
git add web/src/workspace/__tests__/ChatContext.integration.test.tsx
git commit -m "test(chat): add context picker integration coverage"
```

---

## Agent Prompts（三套）

### Prompt A — 验收 Agent

```markdown
仓库：/Users/lijixiang/ZCodeProject/private-kb
Spec: docs/superpowers/specs/2026-06-27-kb-chat-context-picker-design.md
Plan: docs/superpowers/plans/2026-06-27-kb-chat-context-picker.md

1. npm run web:test && npm run web:build
2. 验证 CV1–CV4、CB1–CB3、CD1
3. 手动：空态选笔记 → composer 出现参考条 → 发送 → light 下 AI 回答加粗为黑字
4. 输出 | ID | PASS/FAIL | 证据 |
```

### Prompt B — 实现 Agent Task 1→7

```markdown
严格按 docs/superpowers/plans/2026-06-27-kb-chat-context-picker.md 顺序执行。
每 Task TDD 五步 + commit。开始 Task 1。
```

### Prompt C — 单 Task 子 Agent

```markdown
只执行 Chat context plan Task {N}。
Plan: docs/superpowers/plans/2026-06-27-kb-chat-context-picker.md
禁止改 SSE 循环、150ms 节流、后端 API。
```

---

## Self-Review

**Spec coverage:** CV/CB/CD 全映射 ✓  
**Placeholder scan:** 无 TBD ✓  
**Type consistency:** `contextDocId`/`contextDocTitle`/`SET_CONTEXT_DOC` 全 plan 一致 ✓  
**Scope:** 不含后端改动 ✓

---

Plan complete and saved to `docs/superpowers/plans/2026-06-27-kb-chat-context-picker.md`. Two execution options:

**1. Subagent-Driven（推荐）** — 每 Task 派 fresh subagent，Task 间 review

**2. Inline Execution** — 本会话批量执行，checkpoint 暂停给你看效果

Which approach?
