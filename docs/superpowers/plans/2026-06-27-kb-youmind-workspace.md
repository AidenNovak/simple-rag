# private-kb YouMind 式统一工作区 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `kb.meimaobing.ai`（`/opt/private-kb`）从分页式 UI 重构为 YouMind 式三栏统一工作区（资料树 | 编辑器 | 对话），支持 Pick 选区上下文与 AI 改文件闭环。

**Architecture:** 新建 `web/src/workspace/*` 模块 + `WorkspaceStore` 集中状态；从 `Chat.tsx`/`Notes.tsx` 抽离 `ChatPane`/`EditorPane`；P2 扩展 `POST /api/chat/stream` 的 `selection` 字段；P3 在 Agent `update_note` 完成时 SSE 推送 `doc_patch` 事件供前端 diff 确认。

**Tech Stack:** Vite 6 + React 18 + TypeScript · Fastify 5 · Drizzle · pgvector · Vitest + Testing Library（新增）· Playwright（E2E）

**Spec:** `docs/superpowers/specs/2026-06-27-kb-youmind-workspace-design.md`

---

## 文件结构（锁定）

| 文件 | 职责 |
|------|------|
| `web/src/workspace/types.ts` | `WorkspaceDoc`, `Selection`, `LayoutPrefs`, `PendingPatch` 类型 |
| `web/src/workspace/WorkspaceStore.tsx` | Context + reducer：`activeDocId`, drafts, dirty, selection, convo, scope |
| `web/src/workspace/WorkspaceShell.tsx` | 三栏布局、拖拽调宽、TopBar、响应式门控 |
| `web/src/workspace/FileTree.tsx` | 文档/笔记列表、对话列表、新建/删除/上传入口 |
| `web/src/workspace/EditorPane.tsx` | Markdown 编辑/预览、保存、非 note 文件 Side Peek 触发 |
| `web/src/workspace/ChatPane.tsx` | 自 `Chat.tsx` 迁移的 SSE 对话 UI，消费 Store |
| `web/src/workspace/SelectionContextBar.tsx` | Pick UI：选区 chip + 加入对话 + 清除 |
| `web/src/workspace/CommandPalette.tsx` | ⌘K 搜索并打开文档 |
| `web/src/workspace/layout.css` | 三栏/grid/flex 样式（从 `styles.css` 拆出 workspace 部分） |
| `web/vitest.config.ts` | Vitest + jsdom 配置 |
| `web/vitest.setup.ts` | `@testing-library/jest-dom` |
| `server/src/routes/chat.ts` | 解析 `selection`；推送 `doc_patch` |
| `server/src/rag/agent.ts` | 将 selection 写入 system prompt；hook update_note 结果 |
| `server/test/workspace-context.test.ts` | selection 注入单测 |
| `server/test/playwright-workspace.spec.ts` | O/B 验收 E2E |

**Deprecated（Phase 3 完成后删除）：** `web/src/screens/Notes.tsx` 路由入口、`NotePanel.tsx`（只读预览由 EditorPane 取代）

---

### Task 1: Vitest 测试基建

**Files:**
- Modify: `package.json`（devDependencies + script）
- Create: `web/vitest.config.ts`
- Create: `web/vitest.setup.ts`
- Create: `web/src/workspace/__tests__/smoke.test.ts`

- [ ] **Step 1: 安装依赖**

```bash
cd /opt/private-kb
npm install -D vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: 在 `package.json` 的 `scripts` 中添加**

```json
"web:test": "vitest run --config web/vitest.config.ts",
"web:test:watch": "vitest --config web/vitest.config.ts"
```

- [ ] **Step 3: 创建 `web/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/__tests__/**/*.{test,spec}.{ts,tsx}"],
    root: "web",
  },
});
```

- [ ] **Step 4: 创建 `web/vitest.setup.ts`**

```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 5: 写 smoke 测试**

```typescript
// web/src/workspace/__tests__/smoke.test.ts
import { describe, it, expect } from "vitest";

describe("vitest smoke", () => {
  it("runs in jsdom", () => {
    expect(typeof window).toBe("object");
  });
});
```

- [ ] **Step 6: 运行测试**

```bash
npm run web:test
```

Expected: PASS（1 test）

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json web/vitest.config.ts web/vitest.setup.ts web/src/workspace/__tests__/smoke.test.ts
git commit -m "test: add vitest for web workspace"
```

---

### Task 2: Workspace 类型与 Store

**Files:**
- Create: `web/src/workspace/types.ts`
- Create: `web/src/workspace/WorkspaceStore.tsx`
- Test: `web/src/workspace/__tests__/WorkspaceStore.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// web/src/workspace/__tests__/WorkspaceStore.test.ts
import { describe, it, expect } from "vitest";
import { workspaceReducer, initialWorkspaceState } from "../WorkspaceStore.js";

describe("workspaceReducer", () => {
  it("marks dirty when draft content changes", () => {
    const s = workspaceReducer(initialWorkspaceState, {
      type: "SET_DRAFT_CONTENT",
      payload: "hello",
    });
    expect(s.dirty).toBe(true);
    expect(s.draftContent).toBe("hello");
  });

  it("sets selection from editor", () => {
    const s = workspaceReducer(initialWorkspaceState, {
      type: "SET_SELECTION",
      payload: { docId: "d1", text: "picked text", start: 0, end: 11 },
    });
    expect(s.selection?.text).toBe("picked text");
  });

  it("clears selection on CLEAR_SELECTION", () => {
    const withSel = { ...initialWorkspaceState, selection: { docId: "d1", text: "x", start: 0, end: 1 } };
    const s = workspaceReducer(withSel, { type: "CLEAR_SELECTION" });
    expect(s.selection).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认 FAIL**

```bash
npm run web:test -- src/workspace/__tests__/WorkspaceStore.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: 创建 `web/src/workspace/types.ts`**

```typescript
export interface WorkspaceDoc {
  id: string;
  title: string;
  kind: "note" | "upload";
  status: "pending" | "ready" | "error";
  createdAt: string;
}

export interface Selection {
  docId: string;
  text: string;
  start: number;
  end: number;
}

export interface LayoutPrefs {
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
}

export interface PendingPatch {
  docId: string;
  title?: string;
  content: string;
  previousContent: string;
}

export type WorkspaceAction =
  | { type: "SET_ACTIVE_DOC"; payload: { id: string; title: string; content: string; kind: WorkspaceDoc["kind"] } }
  | { type: "SET_DRAFT_TITLE"; payload: string }
  | { type: "SET_DRAFT_CONTENT"; payload: string }
  | { type: "MARK_CLEAN" }
  | { type: "SET_SELECTION"; payload: Selection | null }
  | { type: "CLEAR_SELECTION" }
  | { type: "SET_CONVO"; payload: string | null }
  | { type: "SET_SCOPE"; payload: string[] | null }
  | { type: "SET_LAYOUT"; payload: Partial<LayoutPrefs> }
  | { type: "SET_PENDING_PATCH"; payload: PendingPatch | null };
```

- [ ] **Step 4: 创建 `web/src/workspace/WorkspaceStore.tsx`**

```typescript
import { createContext, useContext, useReducer, type ReactNode } from "react";
import type { LayoutPrefs, PendingPatch, Selection, WorkspaceAction, WorkspaceDoc } from "./types.js";

export interface WorkspaceState {
  activeDocId: string | null;
  activeDocKind: WorkspaceDoc["kind"] | null;
  draftTitle: string;
  draftContent: string;
  dirty: boolean;
  selection: Selection | null;
  convoId: string | null;
  scopeDocIds: string[] | null;
  layout: LayoutPrefs;
  pendingPatch: PendingPatch | null;
}

const DEFAULT_LAYOUT: LayoutPrefs = { leftWidth: 240, rightWidth: 380, leftCollapsed: false };

export const initialWorkspaceState: WorkspaceState = {
  activeDocId: null,
  activeDocKind: null,
  draftTitle: "",
  draftContent: "",
  dirty: false,
  selection: null,
  convoId: null,
  scopeDocIds: null,
  layout: loadLayout(),
  pendingPatch: null,
};

function loadLayout(): LayoutPrefs {
  try {
    const raw = localStorage.getItem("kb.workspace.layout");
    if (!raw) return DEFAULT_LAYOUT;
    return { ...DEFAULT_LAYOUT, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "SET_ACTIVE_DOC":
      return {
        ...state,
        activeDocId: action.payload.id,
        activeDocKind: action.payload.kind,
        draftTitle: action.payload.title,
        draftContent: action.payload.content,
        dirty: false,
        selection: null,
        scopeDocIds: [action.payload.id],
      };
    case "SET_DRAFT_TITLE":
      return { ...state, draftTitle: action.payload, dirty: true };
    case "SET_DRAFT_CONTENT":
      return { ...state, draftContent: action.payload, dirty: true };
    case "MARK_CLEAN":
      return { ...state, dirty: false };
    case "SET_SELECTION":
      return { ...state, selection: action.payload };
    case "CLEAR_SELECTION":
      return { ...state, selection: null };
    case "SET_CONVO":
      return { ...state, convoId: action.payload };
    case "SET_SCOPE":
      return { ...state, scopeDocIds: action.payload };
    case "SET_LAYOUT": {
      const layout = { ...state.layout, ...action.payload };
      try { localStorage.setItem("kb.workspace.layout", JSON.stringify(layout)); } catch {}
      return { ...state, layout };
    }
    case "SET_PENDING_PATCH":
      return { ...state, pendingPatch: action.payload };
    default: {
      const _exhaustive: never = action;
      return state;
    }
  }
}

const Ctx = createContext<{ state: WorkspaceState; dispatch: React.Dispatch<WorkspaceAction> } | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(workspaceReducer, initialWorkspaceState);
  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace outside provider");
  return v;
}
```

- [ ] **Step 5: 运行测试 PASS**

```bash
npm run web:test -- src/workspace/__tests__/WorkspaceStore.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add web/src/workspace/types.ts web/src/workspace/WorkspaceStore.tsx web/src/workspace/__tests__/WorkspaceStore.test.ts
git commit -m "feat(workspace): add types and reducer store"
```

---

### Task 3: WorkspaceShell 三栏布局

**Files:**
- Create: `web/src/workspace/WorkspaceShell.tsx`
- Create: `web/src/workspace/layout.css`
- Test: `web/src/workspace/__tests__/WorkspaceShell.test.tsx`

- [ ] **Step 1: 写失败测试**

```typescript
// web/src/workspace/__tests__/WorkspaceShell.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { WorkspaceProvider } from "../WorkspaceStore.js";
import { WorkspaceShell } from "../WorkspaceShell.js";

vi.mock("../FileTree.js", () => ({ FileTree: () => <div data-testid="file-tree" /> }));
vi.mock("../EditorPane.js", () => ({ EditorPane: () => <div data-testid="editor-pane" /> }));
vi.mock("../ChatPane.js", () => ({ ChatPane: () => <div data-testid="chat-pane" /> }));

describe("WorkspaceShell", () => {
  it("renders three columns on desktop", () => {
    render(
      <WorkspaceProvider>
        <WorkspaceShell user={{ email: "a@b.com" }} onOpenSettings={() => {}} />
      </WorkspaceProvider>
    );
    expect(screen.getByTestId("file-tree")).toBeInTheDocument();
    expect(screen.getByTestId("editor-pane")).toBeInTheDocument();
    expect(screen.getByTestId("chat-pane")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveTextContent("私人知识库");
  });
});
```

- [ ] **Step 2: 创建 `web/src/workspace/layout.css`**

```css
.workspace-root {
  display: grid;
  grid-template-columns: var(--ws-left, 240px) 1fr var(--ws-right, 380px);
  grid-template-rows: 48px 1fr;
  height: 100vh;
  overflow: hidden;
}
.workspace-topbar {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border, #e5e5ea);
}
.workspace-left, .workspace-center, .workspace-right {
  overflow: hidden;
  min-height: 0;
}
.workspace-left { border-right: 1px solid var(--border, #e5e5ea); }
.workspace-right { border-left: 1px solid var(--border, #e5e5ea); }
.workspace-resizer {
  width: 4px;
  cursor: col-resize;
  background: transparent;
}
.workspace-mobile-gate {
  display: none;
}
@media (max-width: 1023px) {
  .workspace-root { display: none; }
  .workspace-mobile-gate {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    padding: 24px;
    text-align: center;
    color: var(--text-muted);
  }
}
```

- [ ] **Step 3: 创建 `web/src/workspace/WorkspaceShell.tsx`**

```tsx
import { useCallback, useRef } from "react";
import { useWorkspace } from "./WorkspaceStore.js";
import { FileTree } from "./FileTree.js";
import { EditorPane } from "./EditorPane.js";
import { ChatPane } from "./ChatPane.js";
import { CommandPalette } from "./CommandPalette.js";
import "./layout.css";

interface Props {
  user: { email: string; chatModel?: string | null };
  onOpenSettings: () => void;
}

export function WorkspaceShell({ user, onOpenSettings }: Props) {
  const { state, dispatch } = useWorkspace();
  const dragRef = useRef<"left" | "right" | null>(null);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (dragRef.current === "left") {
      dispatch({ type: "SET_LAYOUT", payload: { leftWidth: Math.max(180, Math.min(400, e.clientX)) } });
    }
    if (dragRef.current === "right") {
      dispatch({ type: "SET_LAYOUT", payload: { rightWidth: Math.max(300, Math.min(560, window.innerWidth - e.clientX)) } });
    }
  }, [dispatch]);

  const onMouseUp = useCallback(() => {
    dragRef.current = null;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }, [onMouseMove]);

  const startDrag = (side: "left" | "right") => (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = side;
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const style = {
    ["--ws-left" as string]: `${state.layout.leftWidth}px`,
    ["--ws-right" as string]: `${state.layout.rightWidth}px`,
  } as React.CSSProperties;

  return (
    <>
      <div className="workspace-mobile-gate">请使用宽度 ≥1280px 的桌面浏览器以获得完整工作区体验。</div>
      <div className="workspace-root" style={style}>
        <header className="workspace-topbar" role="banner">
          <strong>私人知识库</strong>
          <span className="muted" style={{ marginLeft: "auto" }}>{user.email}</span>
          <button type="button" className="btn-secondary" onClick={onOpenSettings}>设置</button>
        </header>
        <aside className="workspace-left"><FileTree /></aside>
        <div className="workspace-resizer" onMouseDown={startDrag("left")} />
        <main className="workspace-center"><EditorPane /></main>
        <div className="workspace-resizer" onMouseDown={startDrag("right")} />
        <aside className="workspace-right"><ChatPane chatModel={user.chatModel} /></aside>
      </div>
      <CommandPalette />
    </>
  );
}
```

- [ ] **Step 4: 创建占位组件（Task 4/5/7 会替换）**

```tsx
// web/src/workspace/FileTree.tsx
export function FileTree() { return <div data-testid="file-tree">FileTree</div>; }
// web/src/workspace/EditorPane.tsx
export function EditorPane() { return <div data-testid="editor-pane">EditorPane</div>; }
// web/src/workspace/ChatPane.tsx
export function ChatPane(_props: { chatModel?: string | null }) { return <div data-testid="chat-pane">ChatPane</div>; }
// web/src/workspace/CommandPalette.tsx
export function CommandPalette() { return null; }
```

- [ ] **Step 5: 运行测试 PASS**

```bash
npm run web:test -- src/workspace/__tests__/WorkspaceShell.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add web/src/workspace/WorkspaceShell.tsx web/src/workspace/layout.css web/src/workspace/FileTree.tsx web/src/workspace/EditorPane.tsx web/src/workspace/ChatPane.tsx web/src/workspace/CommandPalette.tsx web/src/workspace/__tests__/WorkspaceShell.test.tsx
git commit -m "feat(workspace): add three-column shell layout"
```

---

### Task 4: FileTree 文档树

**Files:**
- Modify: `web/src/workspace/FileTree.tsx`
- Test: `web/src/workspace/__tests__/FileTree.test.tsx`

- [ ] **Step 1: 写失败测试（mock api.listDocs）**

```typescript
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WorkspaceProvider } from "../WorkspaceStore.js";
import { FileTree } from "../FileTree.js";

vi.mock("../../api.js", () => ({
  api: {
    listDocs: vi.fn().mockResolvedValue({
      documents: [
        { id: "n1", title: "My Note", kind: "note", status: "ready", createdAt: "2026-01-01" },
        { id: "u1", title: "paper.pdf", kind: "upload", status: "ready", createdAt: "2026-01-02" },
      ],
    }),
    getDoc: vi.fn().mockResolvedValue({ document: { id: "n1", title: "My Note", contentMd: "# Hi", kind: "note" } }),
    createNote: vi.fn(),
    upload: vi.fn(),
    deleteDoc: vi.fn(),
    listConversations: vi.fn().mockResolvedValue({ conversations: [] }),
  },
}));

describe("FileTree", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists notes and uploads", async () => {
    render(<WorkspaceProvider><FileTree /></WorkspaceProvider>);
    expect(await screen.findByText("My Note")).toBeInTheDocument();
    expect(screen.getByText("paper.pdf")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 实现 `FileTree.tsx`（完整逻辑）**

要点：
- `useEffect` 调 `api.listDocs()` + `api.listConversations()`
- 点击 note/upload：`api.getDoc(id)` → `dispatch SET_ACTIVE_DOC`
- 「新建笔记」：`api.createNote("未命名", "")` → 选中
- 「上传」：hidden `<input type="file">` → `api.upload`
- 对话列表：`dispatch SET_CONVO`
- upload 项点击：若 `kind !== note`，dispatch active + EditorPane 显示 DocPreview（Task 5）

- [ ] **Step 3: 测试 PASS + Commit**

```bash
npm run web:test -- src/workspace/__tests__/FileTree.test.tsx
git commit -m "feat(workspace): implement file tree with docs and convos"
```

---

### Task 5: EditorPane 编辑与保存

**Files:**
- Modify: `web/src/workspace/EditorPane.tsx`
- Test: `web/src/workspace/__tests__/EditorPane.test.tsx`

- [ ] **Step 1: 写失败测试**

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { WorkspaceProvider, useWorkspace } from "../WorkspaceStore.js";
import { EditorPane } from "../EditorPane.js";

vi.mock("../../api.js", () => ({
  api: {
    updateNote: vi.fn().mockResolvedValue({ ok: true }),
    createNote: vi.fn(),
  },
}));

function Seed({ children }: { children: React.ReactNode }) {
  const { dispatch } = useWorkspace();
  dispatch({ type: "SET_ACTIVE_DOC", payload: { id: "n1", title: "T", content: "body", kind: "note" } });
  return <>{children}</>;
}

describe("EditorPane", () => {
  it("saves dirty note via PATCH", async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceProvider>
        <Seed><EditorPane /></Seed>
      </WorkspaceProvider>
    );
    const ta = screen.getByRole("textbox", { name: /正文/i });
    await user.clear(ta);
    await user.type(ta, "updated");
    await user.click(screen.getByRole("button", { name: "保存" }));
    const { api } = await import("../../api.js");
    expect(api.updateNote).toHaveBeenCalledWith("n1", "T", "updated");
  });
});
```

- [ ] **Step 2: 实现 EditorPane**

要点：
- `activeDocKind === "note"`：title input + textarea + 保存/预览切换
- 保存：`api.updateNote` → `dispatch MARK_CLEAN` → toast
- `dirty && 切换文档`：由 FileTree 调用 `confirmDiscard()` helper
- 非 note：显示「预览上传文件」按钮 → 打开现有 `DocPreview` modal
- textarea `onSelect` / `onMouseUp`：若选区 ≥10 字 → `dispatch SET_SELECTION`

- [ ] **Step 3: PASS + Commit**

---

### Task 6: 迁移 ChatPane（从 Chat.tsx 抽出）

**Files:**
- Modify: `web/src/workspace/ChatPane.tsx`（~700 行，自 `screens/Chat.tsx` 复制并改）
- Modify: `web/src/screens/Chat.tsx`（保留 re-export 或 deprecated 注释）
- Modify: `web/src/App.tsx`

- [ ] **Step 1: 复制 `Chat.tsx` → `ChatPane.tsx`，改 Props：**

```typescript
interface ChatPaneProps {
  chatModel?: string | null;
}
// 从 useWorkspace 读取：convoId, scopeDocIds, selection, activeDocId, draftContent
// 删除 notePanel 状态 — 引用点击改为 dispatch SET_ACTIVE_DOC + scroll
```

- [ ] **Step 2: 修改 `App.tsx`**

```tsx
import { WorkspaceProvider } from "./workspace/WorkspaceStore.js";
import { WorkspaceShell } from "./workspace/WorkspaceShell.js";
// 删除 view state 与 navItems（chat/documents/notes/search）
// authed 后：
return (
  <WorkspaceProvider>
    {view === "settings" ? (
      <SettingsScreen user={user} onUpdate={setUser} onBack={() => setView("workspace")} />
    ) : (
      <WorkspaceShell user={user} onOpenSettings={() => setView("settings")} />
    )}
  </WorkspaceProvider>
);
```

- [ ] **Step 3: 手动验证**

```bash
npm run dev &
npm run web:dev &
# 打开 http://localhost:5173 — 三栏可见，对话可发送
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(workspace): migrate chat into ChatPane and wire App"
```

---

### Task 7: SelectionContextBar（Pick）

**Files:**
- Create: `web/src/workspace/SelectionContextBar.tsx`
- Modify: `web/src/workspace/EditorPane.tsx`（挂载 bar）
- Modify: `web/src/workspace/ChatPane.tsx`（发送时附带 selection）
- Test: `web/src/workspace/__tests__/SelectionContextBar.test.tsx`

- [ ] **Step 1: 写失败测试**

```typescript
it("shows chip when selection exists", () => {
  // dispatch SET_SELECTION
  expect(screen.getByText(/已选/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "加入对话" })).toBeInTheDocument();
});
```

- [ ] **Step 2: 实现 SelectionContextBar**

```tsx
export function SelectionContextBar() {
  const { state, dispatch } = useWorkspace();
  if (!state.selection) return null;
  return (
    <div className="selection-bar" data-testid="selection-bar">
      <span>已选 {state.selection.text.length} 字</span>
      <button type="button" onClick={() => { /* pin for next message */ }}>加入对话</button>
      <button type="button" aria-label="清除选区" onClick={() => dispatch({ type: "CLEAR_SELECTION" })}>×</button>
    </div>
  );
}
```

- [ ] **Step 3: ChatPane 发送逻辑增加 `pinnedSelection` 状态**

```typescript
// body JSON:
JSON.stringify({
  question,
  conversationId: state.convoId || undefined,
  webSearch,
  selection: pinnedSelection || undefined,
})
// 发送成功后 dispatch CLEAR_SELECTION + setPinnedSelection(null)
```

- [ ] **Step 4: 修改 `web/src/api.ts` — 无需改 ask()，stream 走 fetch 直调**

- [ ] **Step 5: PASS + Commit**

---

### Task 8: 后端 selection 注入

**Files:**
- Modify: `server/src/routes/chat.ts`
- Modify: `server/src/rag/agent.ts`
- Create: `server/test/workspace-context.test.ts`
- Modify: `package.json` — 确保 `"test:workspace": "tsx server/test/workspace-context.test.ts"`

- [ ] **Step 1: 写失败测试**

```typescript
// server/test/workspace-context.test.ts
import { buildSelectionContext } from "../src/rag/agent.js";

const block = buildSelectionContext({
  docId: "d1",
  text: "unique phrase xyz",
  start: 0,
  end: 17,
}, "My Doc");

if (!block.includes("unique phrase xyz")) throw new Error("selection not in prompt");
if (!block.includes("My Doc")) throw new Error("doc title missing");
console.log("workspace-context.test.ts: PASS");
```

- [ ] **Step 2: 在 `agent.ts` 导出 `buildSelectionContext`**

```typescript
export function buildSelectionContext(
  sel: { docId: string; text: string; start?: number; end?: number },
  docTitle: string,
): string {
  return [
    "## 用户当前选区（优先回答此片段）",
    `文档：《${docTitle}》`,
    "```",
    sel.text,
    "```",
  ].join("\n");
}
```

- [ ] **Step 3: `chat.ts` 解析 body.selection，查 doc title，prepend 到 agent system prompt**

- [ ] **Step 4: 运行**

```bash
npm run test:workspace
```

Expected: PASS

- [ ] **Step 5: Commit**

---

### Task 9: 引用跳转到编辑器

**Files:**
- Modify: `web/src/workspace/ChatPane.tsx`
- Modify: `web/src/workspace/EditorPane.tsx`

- [ ] **Step 1: EditorPane 暴露 scrollToSnippet(snippet: string)**

```typescript
// useImperativeHandle 或 custom event `workspace:scroll-to`
export function scrollEditorToText(textarea: HTMLTextAreaElement, needle: string) {
  const idx = textarea.value.indexOf(needle.slice(0, 80));
  if (idx >= 0) {
    textarea.focus();
    textarea.setSelectionRange(idx, idx + Math.min(needle.length, 200));
  }
}
```

- [ ] **Step 2: ChatPane citation chip onClick**

```typescript
if (cite.docId === state.activeDocId) {
  window.dispatchEvent(new CustomEvent("workspace:scroll-to", { detail: cite.snippet }));
} else {
  const doc = await api.getDoc(cite.docId);
  dispatch({ type: "SET_ACTIVE_DOC", payload: { ... } });
  setTimeout(() => window.dispatchEvent(...), 100);
}
```

- [ ] **Step 3: 手动验证 B6 + Commit**

---

### Task 10: CommandPalette（⌘K）

**Files:**
- Modify: `web/src/workspace/CommandPalette.tsx`

- [ ] **Step 1: 实现全局快捷键**

```typescript
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setOpen(true);
    }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, []);
```

- [ ] **Step 2: 搜索 debounce 300ms → `api.search(q, 8)` → 结果列表 → Enter 打开文档**

- [ ] **Step 3: Commit**

---

### Task 11: doc_patch SSE（P3 AI 改文件）

**Files:**
- Modify: `server/src/routes/chat.ts`
- Modify: `server/src/rag/agent.ts`
- Modify: `web/src/workspace/ChatPane.tsx`
- Modify: `web/src/workspace/EditorPane.tsx`

- [ ] **Step 1: agent 循环内，当 tool `update_note` 成功且 `data.noteContent` 存在：**

```typescript
yield { type: "doc_patch", docId: data.documentId, content: args.content, previousContent: prev };
```

- [ ] **Step 2: chat.ts SSE 写入**

```typescript
reply.raw.write(`event: doc_patch\ndata: ${JSON.stringify(evt)}\n\n`);
```

- [ ] **Step 3: ChatPane switch 增加 case doc_patch**

```typescript
case "doc_patch":
  dispatch({ type: "SET_PENDING_PATCH", payload: data });
  break;
```

- [ ] **Step 4: EditorPane 显示 diff bar（接受 = 已写入 DB，刷新 draft；拒绝 = 拉 api.getDoc 还原）**

> 注意：`update_note` 工具已写 DB。UX 上「接受」= 确认并 `MARK_CLEAN`；「拒绝」= 调 `api.updateNote(id, title, previousContent)` 回滚。

- [ ] **Step 5: Commit**

---

### Task 12: Playwright E2E 验收

**Files:**
- Create: `server/test/playwright-workspace.spec.ts`

- [ ] **Step 1: 写 E2E（使用现有 playwright devDependency）**

```typescript
import { test, expect } from "@playwright/test";

test.describe("kb workspace acceptance", () => {
  test.beforeEach(async ({ page }) => {
    // 使用测试账号或 env TEST_EMAIL / TEST_PASSWORD
    await page.goto("http://127.0.0.1:5173");
    // login helper...
  });

  test("O2: three columns visible", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await expect(page.getByTestId("file-tree")).toBeVisible();
    await expect(page.getByTestId("editor-pane")).toBeVisible();
    await expect(page.getByTestId("chat-pane")).toBeVisible();
  });

  test("B1+B2: edit note and persist", async ({ page }) => {
    await page.getByText("新建笔记").click();
    await page.getByLabel("标题").fill("E2E Note");
    await page.getByLabel("正文").fill("unique-e2e-content-9271");
    await page.getByRole("button", { name: "保存" }).click();
    await page.reload();
    await expect(page.getByLabel("正文")).toHaveValue(/unique-e2e-content-9271/);
  });
});
```

- [ ] **Step 2: 运行**

```bash
npm run dev & npm run web:dev &
npx playwright test server/test/playwright-workspace.spec.ts
```

- [ ] **Step 3: Commit + 生产构建验证**

```bash
npm run web:build
docker compose -f docker-compose.prod.yml build private-kb-api
# 部署前备份：cp -a web-dist web-dist.bak-$(date +%Y%m%d)
```

---

### Task 13: 文档与清理

**Files:**
- Modify: `README.md` — 增加 Workspace 截图说明
- Delete or deprecate: `web/src/screens/Notes.tsx` 从 App 路由移除（文件保留 @deprecated 注释）

- [ ] **Step 1: README 增加「统一工作区」章节 + 快捷键 ⌘K**
- [ ] **Step 2: Commit `docs: workspace upgrade`**

---

## Spec 覆盖自检

| Spec ID | Task |
|---------|------|
| V1-V4 | Task 6, 12 |
| O1-O3 | Task 4, 5, 6 |
| O4 | Task 3 |
| O5 | Task 7 |
| O6 | Task 11 |
| B1-B9 | Task 4-10, 12 |
| D1-D4 | Task 5, 7, 8, 11, 3 |

无 TBD / 无占位步骤。

---

## 三套 Agent Prompt

### Prompt A — 验收（输出 Pass/Fail 表格）

```markdown
你是 kb.meimaobing.ai 工作区升级的验收 Agent。代码在 /opt/private-kb。

## 准备
1. `cd /opt/private-kb && npm install`
2. 启动：`npm run dev` + `npm run dev:worker` + `npm run web:dev`
3. 用测试账号登录 http://127.0.0.1:5173

## 规格
阅读 `docs/superpowers/specs/2026-06-27-kb-youmind-workspace-design.md` 中 V/O/B/D 全部条目。

## 执行
对每条标准：执行具体操作 → 记录 Pass/Fail → 失败时附截图路径或 console 日志。

## 输出格式（必须）
| ID | 结果 | 证据 |
|----|------|------|
| V1 | Pass/Fail | ... |
（全部 ID 逐行填写）

## 一票否决
任一 V* Fail → 总结第一修复项并 STOP。

## 额外命令
- 单元测试：`npm run web:test`
- E2E：`npx playwright test server/test/playwright-workspace.spec.ts`
- 搜索验证：`curl -s -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"query":"<E2E_UNIQUE_STRING>","topK":5}' http://127.0.0.1:8787/api/search`
```

### Prompt B — 实现（按 Task 1→13 顺序）

```markdown
实现 private-kb YouMind 式统一工作区。

## 必读
- Spec: `docs/superpowers/specs/2026-06-27-kb-youmind-workspace-design.md`
- Plan: `docs/superpowers/plans/2026-06-27-kb-youmind-workspace.md`

## 规则
- 严格按 Task 1→13 顺序执行，每 Task 完成后 `npm run web:test`（如适用）并 git commit
- 遵循现有代码风格（React 函数组件、`.js` 扩展名 import、CSS 变量）
- 不破坏现有 API 消费者；`/settings` BYOK 流程保持不变
- 生产变更前备份 `web-dist` 与 `docker-compose.prod.yml`

## 开始
从 Task 1 Step 1 执行。当前 Task 完成前不要跳 Task。
```

### Prompt C — 单 Task Subagent（将 `<N>` 替换为 1-13）

```markdown
在 /opt/private-kb 执行 Implementation Plan 的 **Task <N>** 全部 Steps。

## 输入
- Plan 文件：`docs/superpowers/plans/2026-06-27-kb-youmind-workspace.md`
- 只读 Task <N> 章节，不执行其他 Task

## 完成标准
- Task 内所有 checkbox steps 完成
- 该 Task 指定的测试命令 PASS
- 单个 git commit，message 与 Plan 中 Step 5/6 一致

## 回报
- 改了哪些文件
- 测试输出摘要
- 下一 Task 是否可开始（有无阻塞）
```

---

## 生产部署清单

```bash
# 1. 备份
ssh meimaobing "cd /opt/private-kb && cp -a web-dist web-dist.bak-$(date +%Y%m%d) && pg_dump ... "

# 2. 构建
npm run build && npm run web:build

# 3. 同步 web-dist + 重启
docker compose -f docker-compose.prod.yml up -d --build private-kb-api private-kb-worker

# 4. 验证
curl -sI https://kb.meimaobing.ai | head -5

# 5. 回滚
# mv web-dist.bak-YYYYMMDD web-dist && docker compose ... restart
```

---

**Plan complete.** 路径：
- Spec: `docs/superpowers/specs/2026-06-27-kb-youmind-workspace-design.md`
- Plan: `docs/superpowers/plans/2026-06-27-kb-youmind-workspace.md`

**执行选项：**

1. **Subagent-Driven（推荐）** — 每个 Task 派一个 subagent，Task 间你做 review
2. **Inline Execution** — 本会话用 executing-plans 按 Task 批量执行，检查点暂停

你选哪种？
