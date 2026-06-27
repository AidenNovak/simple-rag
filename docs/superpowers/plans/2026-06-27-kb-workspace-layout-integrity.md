# private-kb 工作区布局完整性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复三栏工作区 Grid 错位与 Composer 脱离右栏问题，并建立 Layout invariants + 几何/视觉回归测试，保证布局不再漂移。

**Architecture:** 将 Grid 改为显式 5 列 + `grid-template-areas`；resizer 占独立列；Chat composer 改为 flex 子节点；`layout/invariants.ts` 提供可测试的几何契约；Playwright 做 bounding-box 与 screenshot baseline 验证。

**Tech Stack:** React 18 · Vitest · Testing Library · Playwright · CSS Grid

**Spec:** `docs/superpowers/specs/2026-06-27-kb-workspace-layout-integrity-design.md`

**Repo:** `/Users/lijixiang/ZCodeProject/private-kb`

---

## 文件结构（锁定）

| 文件 | 职责 |
|------|------|
| `web/src/workspace/layout/invariants.ts` | `assertPaneLayout`、`isComposerContained`、`getPaneRects` |
| `web/src/workspace/layout/WorkspaceLayout.tsx` | Grid DOM 唯一 owner；拖拽 resizer；`data-pane` 属性 |
| `web/src/workspace/WorkspaceShell.tsx` | 顶栏 + 委托 Layout；不再直接写 grid 子节点 |
| `web/src/workspace/layout.css` | 5 列 grid、pane、composer-stack 样式 |
| `web/src/workspace/ChatPane.tsx` | `composer-wrap` → `ws-composer-stack` |
| `web/src/styles.css` | 删除 L740–867 遗留 `.workspace` 块 |

---

### Task 1: Layout Invariants 模块

**Files:**
- Create: `web/src/workspace/layout/invariants.ts`
- Create: `web/src/workspace/layout/__tests__/invariants.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// web/src/workspace/layout/__tests__/invariants.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { assertPaneLayout, isComposerContained } from "../invariants.js";

describe("assertPaneLayout", () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    root.className = "workspace-root";
    root.innerHTML = `
      <aside data-pane="left" style="position:absolute;left:0;top:0;width:200px;height:600px"></aside>
      <main data-pane="center" style="position:absolute;left:204px;top:0;width:400px;height:600px"></main>
      <aside data-pane="right" style="position:absolute;left:608px;top:0;width:300px;height:600px"></aside>
    `;
    document.body.appendChild(root);
    // jsdom 无 layout engine，用 getBoundingClientRect mock
    for (const el of root.querySelectorAll("[data-pane]")) {
      const pane = el as HTMLElement;
      const left = pane.dataset.pane === "left" ? 0 : pane.dataset.pane === "center" ? 204 : 608;
      const width = pane.dataset.pane === "center" ? 400 : pane.dataset.pane === "left" ? 200 : 300;
      pane.getBoundingClientRect = () =>
        ({ left, right: left + width, top: 0, bottom: 600, width, height: 600, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
    }
  });

  it("passes when panes are ordered left-center-right", () => {
    const r = assertPaneLayout(root);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("fails when center is left of left pane", () => {
    const center = root.querySelector('[data-pane="center"]') as HTMLElement;
    center.getBoundingClientRect = () =>
      ({ left: 0, right: 100, top: 0, bottom: 600, width: 100, height: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    const r = assertPaneLayout(root);
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe("isComposerContained", () => {
  it("returns true when composer inside chat pane", () => {
    const chat = document.createElement("div");
    chat.getBoundingClientRect = () =>
      ({ left: 600, right: 900, top: 0, bottom: 800, width: 300, height: 800, x: 600, y: 0, toJSON: () => ({}) }) as DOMRect;
    const composer = document.createElement("div");
    composer.getBoundingClientRect = () =>
      ({ left: 610, right: 890, top: 700, bottom: 780, width: 280, height: 80, x: 610, y: 700, toJSON: () => ({}) }) as DOMRect;
    expect(isComposerContained(chat, composer)).toBe(true);
  });

  it("returns false when composer escapes right pane", () => {
    const chat = document.createElement("div");
    chat.getBoundingClientRect = () =>
      ({ left: 600, right: 900, top: 0, bottom: 800, width: 300, height: 800, x: 600, y: 0, toJSON: () => ({}) }) as DOMRect;
    const composer = document.createElement("div");
    composer.getBoundingClientRect = () =>
      ({ left: 0, right: 1400, top: 700, bottom: 780, width: 1400, height: 80, x: 0, y: 700, toJSON: () => ({}) }) as DOMRect;
    expect(isComposerContained(chat, composer)).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认 FAIL**

```bash
cd /Users/lijixiang/ZCodeProject/private-kb
npm run web:test -- web/src/workspace/layout/__tests__/invariants.test.ts
```

Expected: FAIL — `Cannot find module '../invariants.js'`

- [ ] **Step 3: 实现 `invariants.ts`**

```typescript
// web/src/workspace/layout/invariants.ts
export type PaneName = "left" | "center" | "right";

export interface LayoutAssertResult {
  ok: boolean;
  errors: string[];
}

const PANE_ORDER: PaneName[] = ["left", "center", "right"];
const TOLERANCE_PX = 2;

function rect(el: Element): DOMRect {
  return (el as HTMLElement).getBoundingClientRect();
}

export function getPaneElements(root: HTMLElement): Record<PaneName, HTMLElement | null> {
  return {
    left: root.querySelector('[data-pane="left"]') as HTMLElement | null,
    center: root.querySelector('[data-pane="center"]') as HTMLElement | null,
    right: root.querySelector('[data-pane="right"]') as HTMLElement | null,
  };
}

/** 断言三栏存在、有高度、且水平顺序 left < center < right（允许 resizer 间隙） */
export function assertPaneLayout(root: HTMLElement): LayoutAssertResult {
  const errors: string[] = [];
  const panes = getPaneElements(root);

  for (const name of PANE_ORDER) {
    const el = panes[name];
    if (!el) {
      errors.push(`missing [data-pane="${name}"]`);
      continue;
    }
    const r = rect(el);
    if (r.height <= 0) errors.push(`pane "${name}" has zero height`);
    if (r.width <= 0) errors.push(`pane "${name}" has zero width`);
  }

  const left = panes.left ? rect(panes.left) : null;
  const center = panes.center ? rect(panes.center) : null;
  const right = panes.right ? rect(panes.right) : null;

  if (left && center && left.right - TOLERANCE_PX > center.left) {
    errors.push(`center pane overlaps or precedes left (left.right=${left.right}, center.left=${center.left})`);
  }
  if (center && right && center.right - TOLERANCE_PX > right.left) {
    errors.push(`right pane overlaps or precedes center (center.right=${center.right}, right.left=${right.left})`);
  }

  return { ok: errors.length === 0, errors };
}

/** composer 完全落在 chatPane 矩形内（容差 1px） */
export function isComposerContained(chatPane: HTMLElement, composer: HTMLElement, tolerance = 1): boolean {
  const p = chatPane.getBoundingClientRect();
  const c = composer.getBoundingClientRect();
  return (
    c.left >= p.left - tolerance &&
    c.right <= p.right + tolerance &&
    c.top >= p.top - tolerance &&
    c.bottom <= p.bottom + tolerance
  );
}
```

- [ ] **Step 4: 运行 PASS**

```bash
npm run web:test -- web/src/workspace/layout/__tests__/invariants.test.ts
```

Expected: PASS（2 tests × 2 cases）

- [ ] **Step 5: Commit**

```bash
git add web/src/workspace/layout/invariants.ts web/src/workspace/layout/__tests__/invariants.test.ts
git commit -m "feat(workspace): add layout geometry invariants"
```

---

### Task 2: 5 列 Grid + grid-template-areas

**Files:**
- Modify: `web/src/workspace/layout.css`（L1–46 区域替换）
- Create: `web/src/workspace/__tests__/LayoutGrid.test.tsx`

- [ ] **Step 1: 写失败测试**

```typescript
// web/src/workspace/__tests__/LayoutGrid.test.tsx
import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { WorkspaceProvider } from "../WorkspaceStore.js";
import { WorkspaceLayout } from "../layout/WorkspaceLayout.js";

vi.mock("../FileTree.js", () => ({ FileTree: () => <div data-testid="file-tree" /> }));
vi.mock("../EditorPane.js", () => ({ EditorPane: () => <div data-testid="editor-pane" /> }));
vi.mock("../ChatPane.js", () => ({ ChatPane: () => <div data-testid="chat-pane" /> }));

describe("WorkspaceLayout grid", () => {
  it("renders exactly three data-pane nodes and two resizers", () => {
    const { container } = render(
      <WorkspaceProvider>
        <WorkspaceLayout chatModel={null} />
      </WorkspaceProvider>
    );
    const root = container.querySelector(".workspace-root")!;
    expect(root.querySelectorAll("[data-pane]")).toHaveLength(3);
    expect(root.querySelectorAll(".workspace-resizer")).toHaveLength(2);
    expect(root.querySelector('[data-pane="left"]')).toBeTruthy();
    expect(root.querySelector('[data-pane="center"]')).toBeTruthy();
    expect(root.querySelector('[data-pane="right"]')).toBeTruthy();
  });
});
```

- [ ] **Step 2: 运行 FAIL**（WorkspaceLayout 不存在）

```bash
npm run web:test -- web/src/workspace/__tests__/LayoutGrid.test.tsx
```

- [ ] **Step 3: 替换 `layout.css` 头部 Grid 定义**

将 `layout.css` L1–31 替换为：

```css
.workspace-root {
  display: grid;
  grid-template-columns:
    var(--ws-left, 240px)
    4px
    minmax(0, 1fr)
    4px
    var(--ws-right, 380px);
  grid-template-rows: 48px 1fr;
  grid-template-areas:
    "topbar    topbar    topbar    topbar    topbar"
    "left      resizer-l center    resizer-r right";
  height: 100vh;
  overflow: hidden;
}
.workspace-topbar { grid-area: topbar; }
.workspace-left { grid-area: left; }
.workspace-resizer-left { grid-area: resizer-l; cursor: col-resize; width: 4px; min-width: 4px; }
.workspace-center { grid-area: center; }
.workspace-resizer-right { grid-area: resizer-r; cursor: col-resize; width: 4px; min-width: 4px; }
.workspace-right { grid-area: right; }
.workspace-resizer-left:hover,
.workspace-resizer-right:hover { background: rgba(87, 134, 254, 0.2); }
.workspace-topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border, #e5e5ea);
}
.workspace-topbar .ws-title { font-weight: 600; }
.workspace-left,
.workspace-center,
.workspace-right {
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.workspace-left { border-right: 1px solid var(--border, #e5e5ea); }
.workspace-right { border-left: 1px solid var(--border, #e5e5ea); }
```

删除旧 `.workspace-resizer` 单类（已拆为 left/right）。

- [ ] **Step 4: 创建 `WorkspaceLayout.tsx`**

```tsx
// web/src/workspace/layout/WorkspaceLayout.tsx
import { useCallback, useRef, type ReactNode } from "react";
import { useWorkspace } from "../WorkspaceStore.js";
import { FileTree } from "../FileTree.js";
import { EditorPane } from "../EditorPane.js";
import { ChatPane } from "../ChatPane.js";
import "../layout.css";

interface Props {
  chatModel?: string | null;
  topbar?: ReactNode;
}

export function WorkspaceLayout({ chatModel, topbar }: Props) {
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
    <div className="workspace-root" style={style}>
      <header className="workspace-topbar" role="banner">{topbar}</header>
      <aside className="workspace-left" data-pane="left" data-testid="file-tree-pane">
        <FileTree />
      </aside>
      <div className="workspace-resizer-left" role="separator" aria-orientation="vertical" onMouseDown={startDrag("left")} />
      <main className="workspace-center" data-pane="center" data-testid="editor-pane">
        <EditorPane />
      </main>
      <div className="workspace-resizer-right" role="separator" aria-orientation="vertical" onMouseDown={startDrag("right")} />
      <aside className="workspace-right" data-pane="right" data-testid="chat-pane">
        <ChatPane chatModel={chatModel} />
      </aside>
    </div>
  );
}
```

- [ ] **Step 5: 精简 `WorkspaceShell.tsx`**

```tsx
import { WorkspaceLayout } from "./layout/WorkspaceLayout.js";
import { CommandPalette } from "./CommandPalette.js";
import "./layout.css";

interface Props {
  user: { email: string; chatModel?: string | null };
  onOpenSettings: () => void;
}

export function WorkspaceShell({ user, onOpenSettings }: Props) {
  return (
    <>
      <div className="workspace-mobile-gate">请使用宽度 ≥1280px 的桌面浏览器以获得完整工作区体验。</div>
      <WorkspaceLayout
        chatModel={user.chatModel}
        topbar={
          <>
            <span className="ws-title">私人知识库</span>
            <span className="muted" style={{ marginLeft: "auto", fontSize: 13 }}>{user.email}</span>
            <button type="button" className="btn-secondary" style={{ padding: "4px 12px", fontSize: 13 }} onClick={onOpenSettings}>设置</button>
          </>
        }
      />
      <CommandPalette />
    </>
  );
}
```

- [ ] **Step 6: 运行 PASS**

```bash
npm run web:test -- web/src/workspace/__tests__/LayoutGrid.test.tsx
```

- [ ] **Step 7: Commit**

```bash
git add web/src/workspace/layout.css web/src/workspace/layout/WorkspaceLayout.tsx web/src/workspace/WorkspaceShell.tsx web/src/workspace/__tests__/LayoutGrid.test.tsx
git commit -m "fix(workspace): use 5-column grid with explicit grid areas"
```

---

### Task 3: Composer Flex Containment（修复 R2）

**Files:**
- Modify: `web/src/workspace/ChatPane.tsx`（composer 区域）
- Modify: `web/src/workspace/layout.css`（ws-composer-stack）
- Modify: `web/src/styles.css`（scoped override）
- Create: `web/src/workspace/__tests__/ComposerContainment.test.tsx`

- [ ] **Step 1: 写失败测试**

```typescript
// web/src/workspace/__tests__/ComposerContainment.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { WorkspaceProvider } from "../WorkspaceStore.js";
import { ChatPane } from "../ChatPane.js";

vi.mock("../../api.js", () => ({
  api: { listDocs: vi.fn().mockResolvedValue({ documents: [{ id: "1", title: "n", status: "ready" }] }), listConversations: vi.fn().mockResolvedValue({ conversations: [] }) },
  getToken: () => "t",
}));

describe("ChatPane composer containment", () => {
  it("uses ws-composer-stack instead of composer-wrap", () => {
    render(<WorkspaceProvider><ChatPane /></WorkspaceProvider>);
    expect(document.querySelector(".ws-composer-stack")).toBeTruthy();
    expect(document.querySelector(".composer-wrap")).toBeNull();
  });

  it("composer textarea is inside ws-chat", () => {
    render(<WorkspaceProvider><ChatPane /></WorkspaceProvider>);
    const chat = document.querySelector(".ws-chat")!;
    const ta = screen.getByPlaceholder(/发送消息/);
    expect(chat.contains(ta)).toBe(true);
  });
});
```

- [ ] **Step 2: 运行 FAIL**

```bash
npm run web:test -- web/src/workspace/__tests__/ComposerContainment.test.tsx
```

- [ ] **Step 3: 修改 `ChatPane.tsx` 底部结构**

将：

```tsx
      <div className="composer-wrap">
        {(pinnedSelection || state.selection) && ( ... )}
        <div className="composer">...</div>
      </div>
```

替换为：

```tsx
      <div className="ws-composer-stack" data-testid="composer-stack">
        {(pinnedSelection || state.selection) && (
          <div className="ws-context-bar">
            <IconSource size={12} />
            <span>已带入选区 {(pinnedSelection || state.selection?.text || "").length} 字</span>
            <button className="ws-context-clear" onClick={() => { setPinnedSelection(null); dispatch({ type: "CLEAR_SELECTION" }); }}>×</button>
          </div>
        )}
        <div className="composer ws-composer">
          <textarea ref={taRef} rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }} placeholder={noDocs ? "先新建笔记或上传文档…" : "发送消息（Enter 发送 / Shift+Enter 换行）"} />
          <button className={`tool-toggle ${webSearch ? "on" : ""}`} onClick={toggleWebSearch} title={webSearch ? "网络搜索：开启" : "网络搜索：关闭"} aria-pressed={webSearch}><IconGlobe size={16} /><span>联网</span></button>
          {busy ? <button className="send-btn stop" onClick={stop} aria-label="停止生成"><IconStop size={18} /></button> : <button className="send-btn" onClick={ask} disabled={!input.trim() || noDocs} aria-label="发送"><IconSend size={18} /></button>}
        </div>
      </div>
```

- [ ] **Step 4: 在 `layout.css` 追加**

```css
/* Chat containment：composer 必须是 flex 子节点，禁止 absolute 逃逸 */
.ws-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-main);
}
.ws-chat .chat-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.ws-composer-stack {
  flex-shrink: 0;
  padding: 8px 12px 12px;
  background: var(--bg-main);
  border-top: 1px solid var(--border);
}
.ws-composer {
  max-width: none;
  margin: 0;
}
```

- [ ] **Step 5: 在 `styles.css` 的 `.composer-wrap` 规则后追加 scoped 禁用**

```css
/* 工作区 Chat 不使用 absolute composer（见 layout.css ws-composer-stack） */
.ws-chat .composer-wrap { display: none; }
```

- [ ] **Step 6: 运行 PASS + 全量单测**

```bash
npm run web:test
```

Expected: 全部 PASS（≥17 tests）

- [ ] **Step 7: Commit**

```bash
git add web/src/workspace/ChatPane.tsx web/src/workspace/layout.css web/src/styles.css web/src/workspace/__tests__/ComposerContainment.test.tsx
git commit -m "fix(workspace): contain chat composer inside right pane flex stack"
```

---

### Task 4: Pane testid + FileTree 根节点

**Files:**
- Modify: `web/src/workspace/FileTree.tsx`
- Modify: `web/src/workspace/EditorPane.tsx`
- Modify: `web/src/workspace/__tests__/WorkspaceShell.test.tsx`

- [ ] **Step 1: FileTree 根 div 加 `data-testid="file-tree"`**

```tsx
  return (
    <div className="ws-filetree" data-testid="file-tree">
```

- [ ] **Step 2: EditorPane 根 div 加 `data-testid="editor-pane"`**（与 WorkspaceLayout 外层 testid 不冲突：内层给空态/编辑态）

```tsx
  if (!state.activeDocId) {
    return (
      <div className="ws-editor-empty" data-testid="editor-pane">
```

编辑态 `.ws-editor` 同样加 `data-testid="editor-pane"`。

- [ ] **Step 3: 更新 WorkspaceShell.test — 去掉 mock testid，测真实 Layout**

- [ ] **Step 4: Commit**

```bash
git commit -m "test(workspace): add stable data-testid on panes"
```

---

### Task 5: 删除 styles.css 遗留 `.workspace` 块

**Files:**
- Modify: `web/src/styles.css`（删除 L740–867）

- [ ] **Step 1: 删除整块**

删除从 `/* ===== 工作台（三栏：文件树 / 编辑器 / 对话）===== */` 到 `@media (max-width: 900px) { ... }` 闭合括号的全部内容（约 L740–867）。

保留 `.ws-patch-bar` 等若在 867 之后且被 EditorPane 使用的规则——若 patch diff 样式已在 `layout.css`，则只删 workspace 块。

- [ ] **Step 2: 验证无引用 breakage**

```bash
npm run web:build && npm run web:test
```

- [ ] **Step 3: Commit**

```bash
git add web/src/styles.css
git commit -m "chore(workspace): remove duplicate .workspace CSS block"
```

---

### Task 6: 强化 playwright-workspace.spec.ts

**Files:**
- Modify: `server/test/playwright-workspace.spec.ts`

- [ ] **Step 1: 修复 V2 测试 — 去掉 `.catch`，断言三 pane**

```typescript
  test("V2/O2: three columns visible on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await expect(page.getByTestId("file-tree")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("editor-pane").first()).toBeVisible();
    await expect(page.getByTestId("chat-pane").first()).toBeVisible();
    await expect(page.getByRole("banner")).toHaveText(/私人知识库/);
  });
```

- [ ] **Step 2: 运行**

```bash
# 终端 1: npm run dev
# 终端 2:
E2E_NO_AUTOSERVE=1 npx playwright test server/test/playwright-workspace.spec.ts
```

Expected: 3/3 PASS

- [ ] **Step 3: Commit**

```bash
git add server/test/playwright-workspace.spec.ts
git commit -m "test(e2e): strengthen workspace column visibility assertions"
```

---

### Task 7: Playwright 几何 + 视觉回归

**Files:**
- Create: `server/test/playwright-layout.spec.ts`
- Modify: `playwright.config.ts`（可选 snapshotPathTemplate）

- [ ] **Step 1: 创建 `playwright-layout.spec.ts`**

```typescript
import { test, expect } from "@playwright/test";

const PASSWORD = process.env.TEST_PASSWORD || "testtest123";
function newEmail() {
  const base = process.env.TEST_EMAIL || "e2e-layout@test.local";
  const [name, domain] = base.includes("@") ? base.split("@") : ["e2e-layout", "test.local"];
  return `${name}-${Date.now()}-${Math.floor(Math.random() * 9999)}@${domain}`;
}

async function login(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "注册", exact: true }).click().catch(() => {});
  await page.getByPlaceholder("you@example.com").fill(newEmail());
  await page.getByPlaceholder("••••••••").fill(PASSWORD);
  await page.getByRole("button", { name: "创建账号" }).click();
  await expect(page.getByRole("banner")).toBeVisible({ timeout: 20000 });
}

test.describe("layout integrity", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await login(page);
  });

  test("LV1: panes ordered left-center-right", async ({ page }) => {
    const boxes = await page.evaluate(() => {
      const q = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      return {
        left: q('[data-pane="left"]'),
        center: q('[data-pane="center"]'),
        right: q('[data-pane="right"]'),
      };
    });
    expect(boxes.left.right).toBeLessThanOrEqual(boxes.center.left + 6);
    expect(boxes.center.right).toBeLessThanOrEqual(boxes.right.left + 6);
    expect(boxes.left.width).toBeGreaterThan(100);
    expect(boxes.center.width).toBeGreaterThan(200);
    expect(boxes.right.width).toBeGreaterThan(200);
  });

  test("LV2: composer contained in right pane", async ({ page }) => {
    const ok = await page.evaluate(() => {
      const chat = document.querySelector('[data-pane="right"]')!;
      const composer = document.querySelector("[data-testid=composer-stack]")!;
      const p = chat.getBoundingClientRect();
      const c = composer.getBoundingClientRect();
      return c.left >= p.left - 1 && c.right <= p.right + 1 && c.bottom <= p.bottom + 1;
    });
    expect(ok).toBe(true);
  });

  test("LB1: resize left resizer preserves order", async ({ page }) => {
    const resizer = page.locator(".workspace-resizer-left");
    const box = await resizer.boundingBox();
    if (!box) throw new Error("no resizer");
    await page.mouse.move(box.x + 2, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + 80, box.y + 200);
    await page.mouse.up();
    const ordered = await page.evaluate(() => {
      const L = document.querySelector('[data-pane="left"]')!.getBoundingClientRect();
      const C = document.querySelector('[data-pane="center"]')!.getBoundingClientRect();
      const R = document.querySelector('[data-pane="right"]')!.getBoundingClientRect();
      return L.right <= C.left + 6 && C.right <= R.left + 6;
    });
    expect(ordered).toBe(true);
  });

  test("visual baseline: workspace desktop", async ({ page }) => {
    await page.getByRole("button", { name: /新建笔记/ }).first().click();
    await page.getByPlaceholder("笔记标题").fill("Layout Snapshot");
    await expect(page.locator(".workspace-root")).toHaveScreenshot("workspace-1400x900.png", {
      maxDiffPixelRatio: 0.02,
    });
  });
});
```

- [ ] **Step 2: 首次生成 baseline**

```bash
npx playwright test server/test/playwright-layout.spec.ts --update-snapshots
```

- [ ] **Step 3: 二次运行确认 PASS**

```bash
npx playwright test server/test/playwright-layout.spec.ts
```

Expected: 4/4 PASS

- [ ] **Step 4: Commit（含 snapshot）**

```bash
git add server/test/playwright-layout.spec.ts server/test/playwright-layout.spec.ts-snapshots/
git commit -m "test(e2e): add layout geometry and visual regression"
```

---

### Task 8: 文档与验收 Prompt

**Files:**
- Modify: `README.md`（追加 Layout Integrity 章节）
- Modify: `docs/superpowers/specs/2026-06-27-kb-workspace-layout-integrity-design.md`（若实施中有偏差则回写）

- [ ] **Step 1: README 追加**

```markdown
## 工作区布局完整性

三栏布局使用 5 列 CSS Grid（左 | resizer | 中 | resizer | 右）。Chat 输入框在右栏 flex 栈内，不会铺满全窗。

验证：
- `npm run web:test`
- `npm run dev` + `npx playwright test server/test/playwright-layout.spec.ts`
```

- [ ] **Step 2: 全量验证**

```bash
npm run typecheck && npm run web:test && npm run web:build
npx playwright test server/test/playwright-workspace.spec.ts server/test/playwright-layout.spec.ts
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document workspace layout integrity verification"
```

---

## Spec 覆盖自检

| Spec ID | Task |
|---------|------|
| LV1–LV3 | Task 2, 6, 7 |
| LO1–LO4 | Task 2, 3, 5 |
| LB1–LB4 | Task 7 |
| LD1–LD2 | Task 1, 2 |

无 TBD / 无占位步骤。

---

## 三套 Agent Prompt

### Prompt A — 布局验收（Pass/Fail 表格）

```markdown
你是 private-kb 工作区布局完整性验收 Agent。代码在 /Users/lijixiang/ZCodeProject/private-kb。

## 必读
- Spec: docs/superpowers/specs/2026-06-27-kb-workspace-layout-integrity-design.md

## 准备
npm install
npm run dev          # :8787
npm run web:dev      # :5173（或 Playwright 自动启动）

## 自动化
npm run web:test
npx playwright test server/test/playwright-layout.spec.ts server/test/playwright-workspace.spec.ts

## 手动（浏览器 1400×900）
1. 登录后目视：左=文件树，中=编辑器，右=对话
2. 在右栏发一条消息，确认输入框不超出右栏边界
3. 拖拽左 resizer，确认三栏不错位
4. 刷新，确认布局保持

## 输出
| ID | Pass/Fail | 证据 |
|----|-----------|------|
| LV1 | | |
| LV2 | | |
| LV3 | |
| LO1–LO4 | | |
| LB1–LB4 | | |

任一 LV* Fail → STOP 并给出第一修复项。
```

### Prompt B — 按 Task 1→8 实现

```markdown
实现 private-kb 工作区布局完整性修复。

Plan: docs/superpowers/plans/2026-06-27-kb-workspace-layout-integrity.md
Spec: docs/superpowers/specs/2026-06-27-kb-workspace-layout-integrity-design.md

规则：
- 严格 Task 1→8 顺序，每 Task 完成后 npm run web:test 并 commit
- 禁止恢复 .composer-wrap { position:absolute } 于 .ws-chat 内
- Grid 必须保持 5 列 + grid-template-areas

从 Task 1 Step 1 开始。
```

### Prompt C — 单 Task Subagent（`<N>` = 1–8）

```markdown
在 /Users/lijixiang/ZCodeProject/private-kb 执行 Plan 的 Task <N> 全部 Steps。

只读 Task <N> 章节。完成后运行该 Task 指定测试命令并单个 commit。

回报：改动文件列表、测试输出、下一 Task 是否可开始。
```

---

## 生产部署（Task 8 之后）

```bash
# 本地
npm run web:build

# 同步到 meimaobing（示例）
rsync -avz --exclude node_modules /Users/lijixiang/ZCodeProject/private-kb/ meimaobing:/opt/private-kb/
ssh meimaobing "cd /opt/private-kb && npm run web:build && docker compose -f docker-compose.prod.yml up -d --build private-kb-api"

# 验证生产 bundle 无 nav-item、有 workspace-root
curl -s https://kb.meimaobing.ai/assets/index-*.js | grep -o 'workspace-root\|nav-item' | sort -u
# 期望：仅 workspace-root
```

---

**Plan complete.** 路径：
- Spec: `docs/superpowers/specs/2026-06-27-kb-workspace-layout-integrity-design.md`
- Plan: `docs/superpowers/plans/2026-06-27-kb-workspace-layout-integrity.md`

**执行选项：**

1. **Subagent-Driven（推荐）** — 每个 Task 一个 subagent，Task 间 review  
2. **Inline Execution** — 本会话按 Task 1→8 批量执行，检查点暂停  

你选哪种？
