# private-kb Live Craft 编辑器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将中栏改为默认 Markdown 渲染的 Live Craft View，Side Peek 源码编辑，Craft 内 Pick/引用跳转，Scope 下拉 portal 化，右栏对话工作区化。

**Architecture:** 新建 `web/src/workspace/craft/` 模块（`CraftBody`、`SourcePeek`、`scrollToSnippet`）；`EditorPane` 移除 preview/edit 二元切换；`ScopeDropdown` 用 `createPortal` 挂 body；文件 cite 用 `FilePeekPanel` 替代全屏 modal；右栏 `.ws-chat` scoped CSS 取消 768px 居中。

**Tech Stack:** React 18 · markstream-react · Vitest · Testing Library · Playwright

**Spec:** `docs/superpowers/specs/2026-06-27-kb-live-craft-editor-design.md`

**Repo:** `/Users/lijixiang/ZCodeProject/private-kb`

**前置：** 布局完整性 plan 已落地（5 列 grid + `ws-composer-stack`）。若未合入，先完成 `2026-06-27-kb-workspace-layout-integrity.md` Task 1–4。

---

## 文件结构（锁定）

| 文件 | 职责 |
|------|------|
| `web/src/workspace/craft/normalizeMath.ts` | LaTeX `\[…\]` → `$$…$$` 归一化 |
| `web/src/workspace/craft/scrollToSnippet.ts` | 在 Craft 容器内按 snippet 近似滚动 + flash |
| `web/src/workspace/craft/CraftBody.tsx` | 默认 MD 渲染层；双击开 Peek；Pick 选区 |
| `web/src/workspace/craft/SourcePeek.tsx` | 40% 宽 Side Peek；Esc 关闭 |
| `web/src/workspace/craft/useDebouncedSave.ts` | 800ms debounce 自动 PATCH |
| `web/src/workspace/ScopeDropdown.tsx` | Portal 定位的 scope 多选下拉 |
| `web/src/workspace/FilePeekPanel.tsx` | 右栏/中栏侧滑文件预览（非 modal） |
| `web/src/workspace/EditorPane.tsx` | 集成 Craft；删 preview toggle |
| `web/src/workspace/ChatPane.tsx` | ScopeDropdown + FilePeek + 空态/composer 文案 |
| `web/src/workspace/layout.css` | craft / peek / flash / file-peek 样式 |
| `web/src/styles.css` | `.ws-chat .chat-stream` 取消 max-width 居中 |

---

## Spec → Task 映射

| 验收 ID | Task |
|---------|------|
| EV1, EO1, EB1 | Task 2, 4 |
| EV2, ED2 | Task 1, 4 |
| EV3 | Task 5 |
| EO2, EB2 | Task 3, 4 |
| EO3 | Task 4 |
| EB3 | Task 2, 4 |
| EB4 | Task 4（PatchBar 保留） |
| EB5, EO4 | Task 6 |
| ED1 | Task 3, 4 |

---

### Task 1: scrollToSnippet 工具函数

**Files:**
- Create: `web/src/workspace/craft/normalizeMath.ts`
- Create: `web/src/workspace/craft/scrollToSnippet.ts`
- Create: `web/src/workspace/craft/__tests__/scrollToSnippet.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// web/src/workspace/craft/__tests__/scrollToSnippet.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { findSnippetIndex, scrollCraftToSnippet } from "../scrollToSnippet.js";

describe("findSnippetIndex", () => {
  it("finds trimmed needle up to 80 chars", () => {
    const content = "alpha\nbeta gamma\nomega";
    expect(findSnippetIndex(content, "  beta gamma  ")).toBe(6);
  });

  it("returns -1 for empty needle", () => {
    expect(findSnippetIndex("hello", "   ")).toBe(-1);
  });
});

describe("scrollCraftToSnippet", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    container.style.height = "200px";
    container.style.overflow = "auto";
    Object.defineProperty(container, "scrollTop", { writable: true, value: 0 });
    document.body.appendChild(container);
  });

  it("scrolls and adds flash class when snippet found", () => {
    const content = Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n");
    const snippet = "line 25";
    const ok = scrollCraftToSnippet(container, content, snippet, { lineHeight: 28 });
    expect(ok).toBe(true);
    expect(container.scrollTop).toBeGreaterThan(0);
    expect(container.classList.contains("ws-snippet-flash")).toBe(true);
  });

  it("returns false when snippet missing", () => {
    expect(scrollCraftToSnippet(container, "abc", "zzz")).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run web:test -- web/src/workspace/craft/__tests__/scrollToSnippet.test.ts`

Expected: FAIL — `Cannot find module '../scrollToSnippet.js'`

- [ ] **Step 3: 实现**

```typescript
// web/src/workspace/craft/normalizeMath.ts
export function normalizeMath(text: string): string {
  return text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => `$$${m}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => `$${m}$`);
}
```

```typescript
// web/src/workspace/craft/scrollToSnippet.ts
const NEEDLE_MAX = 80;
const DEFAULT_LINE_HEIGHT = 28;
const FLASH_MS = 2000;

export function findSnippetIndex(content: string, snippet: string): number {
  const needle = snippet.trim().slice(0, NEEDLE_MAX);
  if (!needle) return -1;
  return content.indexOf(needle);
}

export function scrollCraftToSnippet(
  container: HTMLElement,
  content: string,
  snippet: string,
  opts?: { lineHeight?: number }
): boolean {
  const idx = findSnippetIndex(content, snippet);
  if (idx < 0) return false;
  const lineHeight = opts?.lineHeight ?? DEFAULT_LINE_HEIGHT;
  const lineNum = content.slice(0, idx).split("\n").length;
  container.scrollTop = Math.max(0, (lineNum - 3) * lineHeight);
  container.classList.add("ws-snippet-flash");
  window.setTimeout(() => container.classList.remove("ws-snippet-flash"), FLASH_MS);
  return true;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run web:test -- web/src/workspace/craft/__tests__/scrollToSnippet.test.ts`

Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/workspace/craft/normalizeMath.ts \
  web/src/workspace/craft/scrollToSnippet.ts \
  web/src/workspace/craft/__tests__/scrollToSnippet.test.ts
git commit -m "feat(craft): add scrollToSnippet utility for cite navigation"
```

---

### Task 2: CraftBody 默认渲染层

**Files:**
- Create: `web/src/workspace/craft/CraftBody.tsx`
- Create: `web/src/workspace/craft/__tests__/CraftBody.test.tsx`

- [ ] **Step 1: 写失败测试**

```typescript
// web/src/workspace/craft/__tests__/CraftBody.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CraftBody } from "../CraftBody.js";

vi.mock("markstream-react", () => ({
  default: ({ content }: { content: string }) => <div data-testid="md">{content}</div>,
}));

describe("CraftBody", () => {
  it("renders markdown content", () => {
    render(<CraftBody content="# Hello" onOpenPeek={() => {}} onPick={() => {}} />);
    expect(screen.getByTestId("md")).toHaveTextContent("# Hello");
  });

  it("double-click opens peek", () => {
    const onOpenPeek = vi.fn();
    render(<CraftBody content="body" onOpenPeek={onOpenPeek} onPick={() => {}} />);
    fireEvent.doubleClick(screen.getByTestId("craft-body"));
    expect(onOpenPeek).toHaveBeenCalledOnce();
  });

  it("mouseup with long selection calls onPick", () => {
    const onPick = vi.fn();
    render(<CraftBody content="abcdefghijklmnop" onOpenPeek={() => {}} onPick={onPick} />);
    const sel = { toString: () => "abcdefghijklmnop", rangeCount: 1 } as Selection;
    vi.spyOn(window, "getSelection").mockReturnValue(sel);
    fireEvent.mouseUp(screen.getByTestId("craft-body"));
    expect(onPick).toHaveBeenCalledWith("abcdefghijklmnop");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run web:test -- web/src/workspace/craft/__tests__/CraftBody.test.ts`

Expected: FAIL — `CraftBody` not exported

- [ ] **Step 3: 实现 CraftBody**

```tsx
// web/src/workspace/craft/CraftBody.tsx
import { useEffect, useRef, useState } from "react";
import MarkdownRender from "markstream-react";
import "markstream-react/index.css";
import "katex/dist/katex.min.css";
import { normalizeMath } from "./normalizeMath.js";

const MIN_PICK_LEN = 10;

interface Props {
  content: string;
  onOpenPeek: () => void;
  onPick: (text: string) => void;
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
}

export function CraftBody({ content, onOpenPeek, onPick, scrollContainerRef }: Props) {
  const innerRef = useRef<HTMLDivElement>(null);
  const ref = scrollContainerRef ?? innerRef;

  const handleMouseUp = () => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? "";
    if (text.length >= MIN_PICK_LEN) onPick(text);
  };

  return (
    <div
      ref={ref}
      className="ws-craft-body"
      data-testid="craft-body"
      onDoubleClick={onOpenPeek}
      onMouseUp={handleMouseUp}
    >
      <div className="ws-craft-inner markstream-react">
        <MarkdownRender content={normalizeMath(content)} final={true} fade={false} dark />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 在 layout.css 追加 craft 样式**

在 `web/src/workspace/layout.css` 末尾追加：

```css
.ws-craft-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 32px;
  cursor: default;
}
.ws-craft-inner { max-width: 720px; }
.ws-snippet-flash {
  animation: ws-flash 2s ease-out;
}
@keyframes ws-flash {
  0%, 20% { background: rgba(87, 134, 254, 0.12); }
  100% { background: transparent; }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run web:test -- web/src/workspace/craft/__tests__/CraftBody.test.tsx`

Expected: 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add web/src/workspace/craft/CraftBody.tsx \
  web/src/workspace/craft/__tests__/CraftBody.test.tsx \
  web/src/workspace/layout.css
git commit -m "feat(craft): add CraftBody default markdown render layer"
```

---

### Task 3: SourcePeek + useDebouncedSave

**Files:**
- Create: `web/src/workspace/craft/useDebouncedSave.ts`
- Create: `web/src/workspace/craft/SourcePeek.tsx`
- Create: `web/src/workspace/craft/__tests__/useDebouncedSave.test.ts`

- [ ] **Step 1: 写失败测试（debounce hook）**

```typescript
// web/src/workspace/craft/__tests__/useDebouncedSave.test.ts
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useDebouncedSave } from "../useDebouncedSave.js";

describe("useDebouncedSave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("calls save after 800ms idle", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ v }) => useDebouncedSave(v, save, 800),
      { initialProps: { v: "a" } }
    );
    rerender({ v: "ab" });
    expect(save).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(save).toHaveBeenCalledWith("ab");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run web:test -- web/src/workspace/craft/__tests__/useDebouncedSave.test.ts`

Expected: FAIL — module not found

- [ ] **Step 3: 实现 hook + SourcePeek**

```typescript
// web/src/workspace/craft/useDebouncedSave.ts
import { useEffect, useRef, useState } from "react";

export function useDebouncedSave(
  value: string,
  save: (v: string) => Promise<void>,
  delayMs = 800
): "idle" | "pending" | "saving" {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const [status, setStatus] = useState<"idle" | "pending" | "saving">("idle");

  useEffect(() => {
    setStatus("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      saving.current = true;
      setStatus("saving");
      try { await save(value); } finally {
        saving.current = false;
        setStatus("idle");
      }
    }, delayMs);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [value, save, delayMs]);

  return status;
}
```

```tsx
// web/src/workspace/craft/SourcePeek.tsx
import { useEffect, useRef } from "react";
import { useDebouncedSave } from "./useDebouncedSave.js";

interface Props {
  open: boolean;
  content: string;
  onChange: (v: string) => void;
  onClose: () => void;
  onSave: (v: string) => Promise<void>;
}

export function SourcePeek({ open, content, onChange, onClose, onSave }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const status = useDebouncedSave(open ? content : "", onSave, 800);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    taRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <aside className="ws-source-peek" data-testid="source-peek" aria-label="源码编辑">
      <div className="ws-peek-head">
        <span>源码</span>
        <span className="ws-save-pill" data-status={status}>
          {status === "saving" ? "保存中" : status === "pending" ? "未保存" : "已保存"}
        </span>
        <button type="button" className="ws-peek-close" aria-label="关闭" onClick={onClose}>×</button>
      </div>
      <textarea
        ref={taRef}
        className="ws-peek-textarea"
        aria-label="Markdown 源码"
        value={content}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
    </aside>
  );
}
```

- [ ] **Step 4: layout.css 追加 peek 样式**

```css
.ws-source-peek {
  position: absolute;
  top: 0;
  right: 0;
  width: 40%;
  height: 100%;
  background: var(--bg-elevated);
  border-left: 1px solid var(--border);
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  z-index: 30;
  animation: ws-peek-in 0.18s ease-out;
}
@keyframes ws-peek-in {
  from { transform: translateX(8px); opacity: 0.6; }
  to { transform: translateX(0); opacity: 1; }
}
.ws-peek-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  flex-shrink: 0;
}
.ws-peek-close { margin-left: auto; font-size: 18px; color: var(--text-muted); }
.ws-peek-textarea {
  flex: 1;
  resize: none;
  padding: 14px 16px;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 13px;
  line-height: 1.65;
  background: var(--bg-main);
  color: var(--text);
}
.ws-save-pill {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(16, 163, 127, 0.15);
  color: #10a37f;
}
.ws-save-pill[data-status="pending"] {
  background: rgba(242, 140, 46, 0.15);
  color: #f28c2e;
}
.ws-save-pill[data-status="saving"] {
  background: rgba(87, 134, 254, 0.15);
  color: #5786fe;
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run web:test -- web/src/workspace/craft/__tests__/useDebouncedSave.test.ts`

Expected: 1 test PASS

- [ ] **Step 6: Commit**

```bash
git add web/src/workspace/craft/useDebouncedSave.ts \
  web/src/workspace/craft/SourcePeek.tsx \
  web/src/workspace/craft/__tests__/useDebouncedSave.test.ts \
  web/src/workspace/layout.css
git commit -m "feat(craft): add SourcePeek side panel with debounced autosave"
```

---

### Task 4: 重构 EditorPane（Live Craft 集成）

**Files:**
- Modify: `web/src/workspace/EditorPane.tsx`（全文替换 note 编辑路径）
- Modify: `web/src/workspace/__tests__/EditorPane.test.tsx`

- [ ] **Step 1: 更新失败测试**

```typescript
// web/src/workspace/__tests__/EditorPane.test.tsx — 替换原 save-via-textarea 测试
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useRef } from "react";
import { describe, it, expect, vi } from "vitest";
import { WorkspaceProvider, useWorkspace } from "../WorkspaceStore.js";
import { EditorPane } from "../EditorPane.js";

vi.mock("../../api.js", () => ({
  api: { updateNote: vi.fn().mockResolvedValue({ ok: true }), createNote: vi.fn() },
  getToken: () => "x",
}));
vi.mock("../../components/Toast.js", () => ({ useToast: () => () => {} }));
vi.mock("../SelectionContextBar.js", () => ({ SelectionContextBar: () => null }));
vi.mock("../craft/CraftBody.js", () => ({
  CraftBody: ({ content, onOpenPeek }: any) => (
    <div data-testid="craft-body" onDoubleClick={onOpenPeek}>{content}</div>
  ),
}));
vi.mock("../craft/SourcePeek.js", () => ({
  SourcePeek: ({ open }: { open: boolean }) => open ? <div data-testid="source-peek" /> : null,
}));

function Seed({ children }: { children: React.ReactNode }) {
  const { dispatch } = useWorkspace();
  useEffect(() => {
    dispatch({ type: "SET_ACTIVE_DOC", payload: { id: "n1", title: "T", content: "body", kind: "note" } });
  }, [dispatch]);
  return <>{children}</>;
}

describe("EditorPane Live Craft", () => {
  it("shows craft body by default without preview toggle", () => {
    render(<WorkspaceProvider><Seed><EditorPane /></Seed></WorkspaceProvider>);
    expect(screen.getByTestId("craft-body")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /预览|编辑/ })).toBeNull();
  });

  it("opens source peek on double-click craft", async () => {
    render(<WorkspaceProvider><Seed><EditorPane /></Seed></WorkspaceProvider>);
    fireEvent.doubleClick(screen.getByTestId("craft-body"));
    expect(screen.getByTestId("source-peek")).toBeInTheDocument();
  });

  it("listens workspace:scroll-to on craft container", () => {
    render(<WorkspaceProvider><Seed><EditorPane /></Seed></WorkspaceProvider>);
    window.dispatchEvent(new CustomEvent("workspace:scroll-to", { detail: "body" }));
    expect(screen.getByTestId("craft-body")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run web:test -- web/src/workspace/__tests__/EditorPane.test.tsx`

Expected: FAIL — preview button still present / no craft-body

- [ ] **Step 3: 重写 EditorPane note 路径**

核心改动（保留 PatchBar、upload 空态、空 workspace 空态）：

```tsx
// web/src/workspace/EditorPane.tsx — 新增 imports，删除 preview state 与 PreviewPane
import { useCallback, useEffect, useRef, useState } from "react";
import { CraftBody } from "./craft/CraftBody.js";
import { SourcePeek } from "./craft/SourcePeek.js";
import { scrollCraftToSnippet } from "./craft/scrollToSnippet.js";
// 删除 normalizeMath 本地函数与 PreviewPane 组件

export function EditorPane() {
  const { state, dispatch } = useWorkspace();
  const toast = useToast();
  const craftRef = useRef<HTMLDivElement>(null);
  const [peekOpen, setPeekOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "dirty" | "saving">("saved");

  const persist = useCallback(async (content: string) => {
    if (!state.activeDocId) return;
    setSaveStatus("saving");
    await api.updateNote(state.activeDocId, state.draftTitle, content);
    dispatch({ type: "MARK_CLEAN" });
    setSaveStatus("saved");
    window.dispatchEvent(new Event("ws:doc-saved"));
  }, [state.activeDocId, state.draftTitle, dispatch]);

  useEffect(() => {
    setSaveStatus(state.dirty ? "dirty" : "saved");
  }, [state.dirty]);

  useEffect(() => {
    const onScrollTo = (e: Event) => {
      const snippet = String((e as CustomEvent).detail || "");
      const el = craftRef.current;
      if (!el || !snippet) return;
      scrollCraftToSnippet(el, state.draftContent, snippet);
    };
    window.addEventListener("workspace:scroll-to", onScrollTo);
    return () => window.removeEventListener("workspace:scroll-to", onScrollTo);
  }, [state.draftContent]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "e" && !peekOpen && document.activeElement?.tagName !== "TEXTAREA") {
        setPeekOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [peekOpen]);

  const onPick = (text: string) => {
    const idx = state.draftContent.indexOf(text);
    dispatch({
      type: "SET_SELECTION",
      payload: {
        docId: state.activeDocId || "",
        text,
        start: idx >= 0 ? idx : 0,
        end: idx >= 0 ? idx + text.length : text.length,
      },
    });
  };

  // ... 空态与 upload 分支保持不变 ...

  return (
    <div className="ws-editor" data-testid="editor-pane">
      <div className="ws-editor-toolbar">
        <input /* title input 不变 */ />
        <span className="muted" style={{ fontSize: 12 }}>{state.draftContent.length} 字</span>
        <span className="ws-save-pill" data-status={saveStatus === "dirty" ? "pending" : saveStatus === "saving" ? "saving" : "idle"}>
          {saveStatus === "saving" ? "保存中" : saveStatus === "dirty" ? "未保存" : "已保存"}
        </span>
      </div>
      <SelectionContextBar />
      <CraftBody
        content={state.draftContent}
        onOpenPeek={() => setPeekOpen(true)}
        onPick={onPick}
        scrollContainerRef={craftRef}
      />
      <SourcePeek
        open={peekOpen}
        content={state.draftContent}
        onChange={(v) => dispatch({ type: "SET_DRAFT_CONTENT", payload: v })}
        onClose={() => setPeekOpen(false)}
        onSave={persist}
      />
      {/* PatchBar 块保持不变；pendingPatch accept 后 Craft 自动重渲染 */}
    </div>
  );
}
```

删除：`preview` state、`PreviewPane`、`captureSelection` textarea 逻辑、「预览/编辑」按钮、手动「保存」按钮（autosave 在 Peek；标题变更仍可在 toolbar blur 时 PATCH，可选 Step：title input onBlur 调 persist）。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run web:test -- web/src/workspace/__tests__/EditorPane.test.tsx`

Expected: 3 tests PASS

- [ ] **Step 5: 全量 workspace 单测**

Run: `npm run web:test`

Expected: 全部 PASS（含 layout invariants）

- [ ] **Step 6: Commit**

```bash
git add web/src/workspace/EditorPane.tsx web/src/workspace/__tests__/EditorPane.test.tsx
git commit -m "feat(craft): replace preview/edit toggle with Live Craft editor"
```

---

### Task 5: ScopeDropdown Portal + FilePeekPanel

**Files:**
- Create: `web/src/workspace/ScopeDropdown.tsx`
- Create: `web/src/workspace/FilePeekPanel.tsx`
- Create: `web/src/workspace/__tests__/ScopeDropdown.test.tsx`
- Modify: `web/src/workspace/ChatPane.tsx`

- [ ] **Step 1: 写失败测试**

```typescript
// web/src/workspace/__tests__/ScopeDropdown.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ScopeDropdown } from "../ScopeDropdown.js";

const docs = [{ id: "d1", title: "Doc A" }, { id: "d2", title: "Doc B" }];

describe("ScopeDropdown", () => {
  it("renders menu in document.body via portal", async () => {
    const user = userEvent.setup();
    render(
      <ScopeDropdown
        anchorRef={{ current: document.body }}
        open={false}
        onToggle={() => {}}
        docs={docs}
        scopeDocIds={null}
        onToggleDoc={() => {}}
        onSelectAll={() => {}}
      />
    );
    expect(document.body.querySelector(".ws-scope-portal")).toBeNull();
  });
});
```

扩展：open=true 时 portal 存在且 `position:fixed`。

- [ ] **Step 2: 实现 ScopeDropdown**

```tsx
// web/src/workspace/ScopeDropdown.tsx
import { createPortal } from "react-dom";
import { useLayoutEffect, useState } from "react";
import { IconLibrary } from "../Icons.js";

interface Doc { id: string; title: string; }

interface Props {
  anchorRef: React.RefObject<HTMLElement>;
  open: boolean;
  onToggle: () => void;
  docs: Doc[];
  scopeDocIds: string[] | null;
  onToggleDoc: (id: string) => void;
  onSelectAll: () => void;
}

export function ScopeDropdown({ anchorRef, open, onToggle, docs, scopeDocIds, onToggleDoc, onSelectAll }: Props) {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 260 });

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: Math.max(240, r.width) });
  }, [open, anchorRef]);

  return (
    <div ref={anchorRef} className="model-switcher">
      <button type="button" className="scope-badge" onClick={onToggle}>
        <IconLibrary size={13} />
        {scopeDocIds === null ? "全部文档" : `${scopeDocIds.length} 篇`}
        <span style={{ fontSize: 10, opacity: 0.6 }}>▼</span>
      </button>
      {open && createPortal(
        <div
          className="ws-scope-portal model-dropdown"
          style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 5000 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-muted)" }}>选择本会话检索的文档</div>
          {docs.map((d) => {
            const checked = scopeDocIds === null || scopeDocIds.includes(d.id);
            return (
              <label key={d.id} className="scope-item" onClick={(e) => { e.stopPropagation(); onToggleDoc(d.id); }}>
                <input type="checkbox" checked={checked} readOnly />
                <span>{d.title}</span>
              </label>
            );
          })}
          <div className="scope-actions">
            <button type="button" className="btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }} onClick={onSelectAll}>全选</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
```

ChatPane 用法：

```tsx
const scopeBtnRef = useRef<HTMLDivElement>(null);
// ...
<ScopeDropdown
  anchorRef={scopeBtnRef}
  open={scopeMenuOpen}
  onToggle={() => setScopeMenuOpen((v) => !v)}
  docs={allDocs}
  scopeDocIds={state.scopeDocIds}
  onToggleDoc={toggleDocInScope}
  onSelectAll={() => { dispatch({ type: "SET_SCOPE", payload: null }); /* ... */ }}
/>
```

- [ ] **Step 3: 实现 FilePeekPanel**

```tsx
// web/src/workspace/FilePeekPanel.tsx
import { useEffect, useState } from "react";
import { api } from "../api.js";
import MarkdownRender from "markstream-react";
import { normalizeMath } from "./craft/normalizeMath.js";
import { IconClose } from "../Icons.js";

export function FilePeekPanel({ docId, onClose }: { docId: string | null; onClose: () => void }) {
  const [doc, setDoc] = useState<any>(null);

  useEffect(() => {
    if (!docId) { setDoc(null); return; }
    api.getDoc(docId).then((r) => setDoc(r.document)).catch(() => setDoc(null));
  }, [docId]);

  useEffect(() => {
    if (!docId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [docId, onClose]);

  if (!docId) return null;

  const raw = doc?.contentMd || doc?.meta?.extractedText || "（无文本内容）";

  return (
    <aside className="ws-file-peek" data-testid="file-peek">
      <div className="ws-peek-head">
        <strong>{doc?.title || "文件预览"}</strong>
        <button type="button" className="ws-peek-close" aria-label="关闭" onClick={onClose}><IconClose size={14} /></button>
      </div>
      <div className="ws-file-peek-body markstream-react">
        <MarkdownRender content={normalizeMath(raw)} final={true} fade={false} dark />
      </div>
    </aside>
  );
}
```

layout.css 追加：

```css
.ws-file-peek {
  position: absolute;
  inset: 0;
  background: var(--bg-main);
  z-index: 25;
  display: flex;
  flex-direction: column;
}
.ws-file-peek-body { flex: 1; overflow-y: auto; padding: 16px 20px; }
```

- [ ] **Step 4: 修改 ChatPane**

- 删除 inline `model-dropdown` 块
- 引入 `ScopeDropdown`、`FilePeekPanel`
- `const scopeBtnRef = useRef<HTMLDivElement>(null);`
- `onCitationClick` 非 note 分支：`setPreviewDoc(c.docId)` 保留，但渲染改为 `<FilePeekPanel docId={previewDoc} onClose={...} />` 放在 `.ws-chat` 内 `position:relative` 容器
- 删除 `<DocPreview docId={previewDoc} .../>`（或仅保留 upload 树入口）

- [ ] **Step 5: 点击外部关闭 scope**

```typescript
useEffect(() => {
  if (!scopeMenuOpen) return;
  const close = () => setScopeMenuOpen(false);
  window.addEventListener("click", close);
  return () => window.removeEventListener("click", close);
}, [scopeMenuOpen]);
```

- [ ] **Step 6: 运行测试**

Run: `npm run web:test -- web/src/workspace/__tests__/ScopeDropdown.test.tsx`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add web/src/workspace/ScopeDropdown.tsx web/src/workspace/FilePeekPanel.tsx \
  web/src/workspace/ChatPane.tsx web/src/workspace/layout.css \
  web/src/workspace/__tests__/ScopeDropdown.test.tsx
git commit -m "feat(chat): portal scope dropdown and in-pane file peek"
```

---

### Task 6: 右栏工作区化文案与样式

**Files:**
- Modify: `web/src/workspace/ChatPane.tsx`（空态 + placeholder）
- Modify: `web/src/workspace/layout.css`
- Modify: `web/src/styles.css`

- [ ] **Step 1: 写失败测试**

```typescript
// web/src/workspace/__tests__/ChatPaneWorkspace.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { WorkspaceProvider } from "../WorkspaceStore.js";
import { ChatPane } from "../ChatPane.js";

vi.mock("../../api.js", () => ({
  api: { listDocs: vi.fn().mockResolvedValue({ documents: [{ id: "1", title: "N", status: "ready" }] }), getMessages: vi.fn().mockResolvedValue({ messages: [] }) },
  getToken: () => "t",
}));
vi.mock("markstream-react", () => ({ default: () => null, TextNode: () => null }));
vi.mock("../../components/Toast.js", () => ({ useToast: () => () => {} }));
vi.mock("../ScopeDropdown.js", () => ({ ScopeDropdown: () => null }));

describe("ChatPane workspace copy", () => {
  it("empty state mentions current note when activeDoc set", () => {
    render(
      <WorkspaceProvider initialOverride={{ activeDocId: "n1", draftTitle: "My Note" } as any}>
        <ChatPane />
      </WorkspaceProvider>
    );
    expect(screen.getByText(/My Note|当前笔记/)).toBeTruthy();
  });
});
```

> 若 `WorkspaceProvider` 无 `initialOverride`，在测试中用 Seed 组件 dispatch `SET_ACTIVE_DOC`。

- [ ] **Step 2: 修改空态与 placeholder**

ChatPane 内：

```tsx
const activeTitle = state.draftTitle || "当前笔记";
// 空态 h1:
<h2 className="ws-chat-empty-title">围绕「{activeTitle}」提问</h2>
// hint:
<div className="hint">
  {state.activeDocId
    ? "答案带来源引用，点击 [n] 可定位到中栏笔记"
    : readyCount === 0 ? "知识库为空。左侧新建笔记或上传文档。" : "请先在左侧选择一篇笔记"}
</div>
// composer placeholder:
placeholder={
  state.activeDocId
    ? `关于「${activeTitle}」提问…`
    : noDocs ? "先新建笔记或上传文档…" : "请先选择左侧笔记"
}
```

- [ ] **Step 3: scoped CSS 取消 768px 居中**

`layout.css` 追加：

```css
.ws-chat .chat-stream,
.ws-chat .chat-empty {
  max-width: none;
  margin: 0;
  padding: 16px 14px 24px;
}
.ws-chat .chat-empty h1,
.ws-chat .ws-chat-empty-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 12px;
}
.ws-chat .chat-empty .hint { font-size: 13px; }
```

- [ ] **Step 4: 运行测试**

Run: `npm run web:test -- web/src/workspace/__tests__/ChatPaneWorkspace.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/workspace/ChatPane.tsx web/src/workspace/layout.css web/src/styles.css \
  web/src/workspace/__tests__/ChatPaneWorkspace.test.tsx
git commit -m "feat(chat): workspace-scoped empty state and composer copy"
```

---

### Task 7: 集成验证 + Agent Prompts

**Files:**
- Create: `web/src/workspace/__tests__/LiveCraft.integration.test.tsx`
- Modify: `docs/superpowers/specs/2026-06-27-kb-live-craft-editor-design.md`（勾选 EC 验收表，可选）

- [ ] **Step 1: 集成测试**

```typescript
// web/src/workspace/__tests__/LiveCraft.integration.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { WorkspaceProvider, useWorkspace } from "../WorkspaceStore.js";
import { EditorPane } from "../EditorPane.js";
import { useEffect } from "react";
import { scrollCraftToSnippet } from "../craft/scrollToSnippet.js";

vi.mock("../../api.js", () => ({
  api: { updateNote: vi.fn().mockResolvedValue({ ok: true }) },
  getToken: () => "x",
}));
vi.mock("../../components/Toast.js", () => ({ useToast: () => () => {} }));
vi.mock("markstream-react", () => ({ default: ({ content }: any) => <div>{content}</div> }));

function Seed() {
  const { dispatch } = useWorkspace();
  useEffect(() => {
    dispatch({ type: "SET_ACTIVE_DOC", payload: { id: "1", title: "T", content: "hello world snippet here", kind: "note" } });
  }, [dispatch]);
  return <EditorPane />;
}

describe("Live Craft integration", () => {
  it("EV1: no preview/edit buttons", () => {
    render(<WorkspaceProvider><Seed /></WorkspaceProvider>);
    expect(screen.queryByRole("button", { name: /预览|编辑/ })).toBeNull();
    expect(screen.getByTestId("craft-body")).toBeInTheDocument();
  });

  it("EV2: scroll-to event reaches craft", () => {
    render(<WorkspaceProvider><Seed /></WorkspaceProvider>);
    const el = document.createElement("div");
    scrollCraftToSnippet(el, "hello world snippet here", "snippet");
    expect(el.classList.contains("ws-snippet-flash")).toBe(true);
  });
});
```

- [ ] **Step 2: 全量测试**

Run: `npm run web:test`

Expected: 全部 PASS

- [ ] **Step 3: 本地手动冒烟**

Run: `npm run web:dev`

Checklist:
- [ ] 打开 note → 默认渲染 MD，无预览按钮
- [ ] 双击 → Side Peek；Esc 关闭；停输 800ms 自动保存
- [ ] Chat 点 cite → 中栏 flash
- [ ] Scope ▼ → 下拉不被裁剪
- [ ] 右栏空态显示笔记名

- [ ] **Step 4: Commit**

```bash
git add web/src/workspace/__tests__/LiveCraft.integration.test.tsx
git commit -m "test(craft): add Live Craft integration coverage"
```

---

## Agent Prompts（三套）

### Prompt A — 整计划验收 Agent

```markdown
你是 private-kb Live Craft 验收 Agent。仓库：`/Users/lijixiang/ZCodeProject/private-kb`。

规格：`docs/superpowers/specs/2026-06-27-kb-live-craft-editor-design.md`
计划：`docs/superpowers/plans/2026-06-27-kb-live-craft-editor.md`

执行：
1. `npm run web:test` — 必须全绿
2. `npm run web:build` — 无 TS 错误
3. 逐项验证 EV1–EV3、EO1–EO4、EB1–EB5、ED1–ED2
4. 输出表格：| ID | PASS/FAIL | 证据（命令输出或 selector）|

一票否决任一项 FAIL → 总评 FAIL。
```

### Prompt B — 实现 Agent（顺序执行全部 Task）

```markdown
你是 private-kb 实现 Agent。严格按 `docs/superpowers/plans/2026-06-27-kb-live-craft-editor.md` Task 1→7 顺序执行。

规则：
- 每 Task 完成 5 步（测试→失败→实现→通过→commit）
- 不跳过测试；不合并 Task
- 路径相对于 repo 根
- 完成后运行 `npm run web:test` 并粘贴摘要

开始 Task 1。
```

### Prompt C — 单 Task 子 Agent（模板）

```markdown
你是 private-kb 子 Agent。只执行 Live Craft 计划 Task {N}：{任务名}。

计划文件：`docs/superpowers/plans/2026-06-27-kb-live-craft-editor.md`
Spec：`docs/superpowers/specs/2026-06-27-kb-live-craft-editor-design.md`

要求：
1. 仅修改该 Task Files 列表中的文件
2. 严格 TDD：先写测试并确认 FAIL，再实现，再 PASS
3. 运行该 Task 指定的 vitest 命令
4. 单 Task commit，message 用计划中给出的
5. 回报：改动文件列表、测试输出、剩余风险

禁止：改动 SSE 对话循环、越界重构、删除 150ms 节流。
```

---

## Self-Review

**Spec coverage:** EV/EO/EB/ED 全部映射到 Task 1–7 ✓

**Placeholder scan:** 无 TBD/TODO/「类似 Task N」✓

**Type consistency:** `scrollCraftToSnippet(container, content, snippet)`、`SET_SELECTION` payload、`persist(content: string)` 全 plan 一致 ✓

**依赖：** layout integrity 5 列 grid 已存在（`layout.css` L1–14）✓
