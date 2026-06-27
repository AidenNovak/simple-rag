# private-kb UI Polish v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Warm Paper token 上建立 Design System v2（typography / spacing / motion / status），引入 lucide-react + Radix dropdown/dialog + cmdk，用 `web/src/ui/` vendored 组件替换 emoji 状态与手写 portal，提升商业级一致性与 a11y。

**Architecture:** 扩展 `theme/` 三层 CSS；新建 `ui/` 薄包装 Radix/cmdk；`Icons.tsx` 改为 lucide 再导出保持 API 稳定；workspace 组件渐进替换，legacy screens 仅 Badge 对齐。

**Tech Stack:** React 18 · Vitest · CSS Custom Properties · lucide-react · cmdk · @radix-ui/react-dropdown-menu · @radix-ui/react-dialog

**Spec:** `docs/superpowers/specs/2026-06-27-kb-ui-polish-v2-design.md`

**Repo:** `/Users/lijixiang/ZCodeProject/private-kb`

**Prerequisite plans（应先 merged）：** `kb-warm-paper-theme`、`kb-apple-sidebar`、`kb-chat-context-picker`

---

## 文件结构（锁定）

| 文件 | 职责 |
|------|------|
| `web/src/theme/tokens.css` | 扩展 spacing / status / z-index / radius scale |
| `web/src/theme/typography.css` | caption / body / title / prose classes |
| `web/src/theme/motion.css` | duration、ease、peek/slide keyframes |
| `web/src/ui/ui.css` | Badge、Button、Dropdown、Dialog、cmdk 纸面样式 |
| `web/src/ui/badge.tsx` | 统一状态 pill |
| `web/src/ui/button.tsx` | ghost / icon 按钮 |
| `web/src/ui/dropdown-menu.tsx` | Radix Dropdown 包装 |
| `web/src/ui/dialog.tsx` | Radix Dialog 包装 |
| `web/src/ui/index.ts` | barrel export |
| `web/src/Icons.tsx` | lucide-react 再导出 |
| `web/src/workspace/ScopeDropdown.tsx` | 改用 ui Dropdown |
| `web/src/workspace/ContextRefBar.tsx` | 改用 ui Dropdown |
| `web/src/workspace/CommandPalette.tsx` | 改用 cmdk |
| `web/src/workspace/FileTree.tsx` | Badge 替代 emoji |
| `web/src/main.tsx` | 引入 typography.css、motion.css、ui.css |

---

## Spec → Task 映射

| 验收 ID | Task |
|---------|------|
| UV4, US2 | Task 1 |
| UV6 | Task 2 |
| UV1, US1 | Task 3, 4, 8 |
| UV2 | Task 5 |
| UV3 | Task 6 |
| US3 | Task 3, 7 |
| UV5 | 每 Task 末尾 + Task 9 |

---

### Task 1: Typography + Spacing + Motion tokens

**Files:**
- Modify: `web/src/theme/tokens.css`
- Create: `web/src/theme/typography.css`
- Create: `web/src/theme/motion.css`
- Create: `web/src/theme/__tests__/designTokens.test.ts`
- Modify: `web/src/main.tsx`

- [ ] **Step 1: 写失败测试**

```typescript
// web/src/theme/__tests__/designTokens.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

describe("design tokens v2", () => {
  beforeEach(() => {
    document.documentElement.setAttribute("data-theme", "light");
  });

  it("tokens.css defines spacing scale", () => {
    const css = readFileSync(resolve(root, "tokens.css"), "utf8");
    expect(css).toContain("--space-1: 4px");
    expect(css).toContain("--status-pending:");
  });

  it("typography.css defines text-caption", () => {
    const css = readFileSync(resolve(root, "typography.css"), "utf8");
    expect(css).toContain(".text-caption");
    expect(css).toContain("var(--text-caption-size");
  });

  it("motion.css respects reduced motion", () => {
    const css = readFileSync(resolve(root, "motion.css"), "utf8");
    expect(css).toContain("prefers-reduced-motion");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run web:test -- web/src/theme/__tests__/designTokens.test.ts`

Expected: FAIL — typography.css not found

- [ ] **Step 3: 扩展 tokens.css（追加到 light/dark 块）**

```css
/* spacing */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 24px;

/* typography sizes (used by typography.css) */
--text-caption-size: 11px;
--text-caption-lh: 1.35;
--text-caption-tracking: 0.06em;
--text-body-size: 14px;
--text-body-lh: 1.55;
--text-title-size: 15px;
--text-title-lh: 1.3;
--text-title-tracking: -0.02em;
--text-prose-size: 15px;
--text-prose-lh: 1.75;

/* status */
--status-pending: #B45309;
--status-pending-bg: rgba(180, 83, 9, 0.12);
--status-ready: #16a34a;
--status-ready-bg: rgba(22, 163, 74, 0.12);
--status-failed: #DC2626;
--status-failed-bg: rgba(220, 38, 38, 0.12);

/* radius + z */
--radius-sm: 6px;
--radius-lg: 14px;
--z-dropdown: 5000;

/* motion */
--duration-fast: 150ms;
--duration-normal: 180ms;
--ease-out: cubic-bezier(0.25, 0.1, 0.25, 1);
```

Dark 块：status 色沿用 `--danger` / amber 变体，写 `--status-pending-bg` 等半透明深色版。

- [ ] **Step 4: 创建 typography.css**

```css
.text-caption {
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-lh);
  letter-spacing: var(--text-caption-tracking);
  color: var(--text-muted);
}
.text-body { font-size: var(--text-body-size); line-height: var(--text-body-lh); }
.text-title {
  font-size: var(--text-title-size);
  line-height: var(--text-title-lh);
  letter-spacing: var(--text-title-tracking);
  font-weight: 600;
  color: var(--text);
}
.text-prose { font-size: var(--text-prose-size); line-height: var(--text-prose-lh); }

.gap-2 { gap: var(--space-2); }
.gap-3 { gap: var(--space-3); }
```

- [ ] **Step 5: 创建 motion.css**

```css
@keyframes kb-fade-in-up {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
.kb-animate-in {
  animation: kb-fade-in-up var(--duration-normal) var(--ease-out) both;
}
.ws-side-peek-panel {
  transition: transform var(--duration-normal) var(--ease-out);
}
@media (prefers-reduced-motion: reduce) {
  .kb-animate-in { animation: none; }
  .ws-side-peek-panel { transition: none; }
}
```

- [ ] **Step 6: main.tsx 引入**

```typescript
import "./theme/typography.css";
import "./theme/motion.css";
```

- [ ] **Step 7: 运行测试确认通过**

Run: `npm run web:test -- web/src/theme/__tests__/designTokens.test.ts`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add web/src/theme/tokens.css web/src/theme/typography.css web/src/theme/motion.css web/src/theme/__tests__/designTokens.test.ts web/src/main.tsx
git commit -m "feat(theme): design system v2 typography spacing motion tokens"
```

---

### Task 2: 安装最小 npm 依赖

**Files:**
- Modify: `package.json`（根目录 monorepo）

- [ ] **Step 1: 安装**

Run:

```bash
npm install lucide-react cmdk @radix-ui/react-dropdown-menu @radix-ui/react-dialog @radix-ui/react-slot
```

Expected: `package.json` dependencies 新增上述 5 包，lockfile 更新。

- [ ] **Step 2: 验证无 Tailwind**

Run: `npm ls tailwindcss 2>/dev/null || true`

Expected: empty / not installed

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(web): add lucide cmdk radix for ui polish v2"
```

---

### Task 3: ui/Badge + ui.css

**Files:**
- Create: `web/src/ui/badge.tsx`
- Create: `web/src/ui/ui.css`
- Create: `web/src/ui/index.ts`
- Create: `web/src/ui/__tests__/Badge.test.tsx`
- Modify: `web/src/main.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
// web/src/ui/__tests__/Badge.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Badge } from "../badge.js";

describe("Badge", () => {
  it("renders pending without emoji", () => {
    render(<Badge variant="pending">处理中</Badge>);
    const el = screen.getByText("处理中");
    expect(el.className).toMatch(/ui-badge/);
    expect(el.textContent).not.toMatch(/⏳/);
  });

  it("applies failed variant", () => {
    render(<Badge variant="failed">失败</Badge>);
    expect(screen.getByText("失败")).toHaveAttribute("data-variant", "failed");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run web:test -- web/src/ui/__tests__/Badge.test.tsx`

Expected: FAIL

- [ ] **Step 3: 实现 badge.tsx + ui.css**

```tsx
// web/src/ui/badge.tsx
import type { ReactNode } from "react";

export type BadgeVariant = "pending" | "ready" | "failed" | "neutral";

interface Props {
  variant: BadgeVariant;
  children: ReactNode;
  className?: string;
}

export function Badge({ variant, children, className = "" }: Props) {
  return (
    <span className={`ui-badge ui-badge--${variant} ${className}`.trim()} data-variant={variant}>
      {children}
    </span>
  );
}
```

```css
/* web/src/ui/ui.css 片段 */
.ui-badge {
  display: inline-flex;
  align-items: center;
  font-size: var(--text-caption-size);
  line-height: 1;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-weight: 500;
}
.ui-badge--pending { color: var(--status-pending); background: var(--status-pending-bg); }
.ui-badge--ready { color: var(--status-ready); background: var(--status-ready-bg); }
.ui-badge--failed { color: var(--status-failed); background: var(--status-failed-bg); }
.ui-badge--neutral { color: var(--text-muted); background: var(--bg-hover); }
```

```typescript
// web/src/ui/index.ts
export { Badge, type BadgeVariant } from "./badge.js";
```

`main.tsx` 增加：`import "./ui/ui.css";`

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run web:test -- web/src/ui/__tests__/Badge.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/ui web/src/main.tsx
git commit -m "feat(ui): add Badge component with warm paper status tokens"
```

---

### Task 4: FileTree 用 Badge 替代 emoji

**Files:**
- Modify: `web/src/workspace/FileTree.tsx`
- Modify: `web/src/workspace/__tests__/FileTree.test.tsx`

- [ ] **Step 1: 更新失败测试**

在 `FileTree.test.tsx` 增加：

```tsx
it("UV1: shows Badge for pending note, not emoji", async () => {
  render(<FileTree />);
  expect(await screen.findByText("处理中")).toBeInTheDocument();
  expect(screen.queryByText("⏳")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run web:test -- web/src/workspace/__tests__/FileTree.test.tsx`

Expected: FAIL — 找不到「处理中」

- [ ] **Step 3: 修改 FileTree Row**

```tsx
import { Badge } from "../ui/index.js";

// 替换 ws-tree-status emoji 行：
{d.status !== "ready" && (
  <Badge variant={d.status === "failed" ? "failed" : "pending"}>
    {d.status === "failed" ? "失败" : "处理中"}
  </Badge>
)}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run web:test -- web/src/workspace/__tests__/FileTree.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/workspace/FileTree.tsx web/src/workspace/__tests__/FileTree.test.tsx
git commit -m "feat(sidebar): replace tree status emoji with Badge"
```

---

### Task 5: ui/DropdownMenu + 迁移 ScopeDropdown & ContextRefBar

**Files:**
- Create: `web/src/ui/dropdown-menu.tsx`
- Create: `web/src/ui/__tests__/DropdownMenu.test.tsx`
- Modify: `web/src/ui/ui.css`
- Modify: `web/src/workspace/ScopeDropdown.tsx`
- Modify: `web/src/workspace/ContextRefBar.tsx`
- Modify: `web/src/workspace/__tests__/ScopeDropdown.test.tsx`

- [ ] **Step 1: 写失败测试（ScopeDropdown 仍打开菜单）**

```tsx
// web/src/ui/__tests__/DropdownMenu.test.tsx —  smoke export test
import { describe, it, expect } from "vitest";
import * as UI from "../index.js";
describe("dropdown-menu exports", () => {
  it("exports DropdownMenu building blocks", () => {
    expect(UI.DropdownMenu).toBeDefined();
    expect(UI.DropdownMenuContent).toBeDefined();
  });
});
```

在 `ScopeDropdown.test.tsx` 增加：打开后菜单容器含 `data-radix-popper-content-wrapper` 或自定义 `data-testid="scope-dropdown-content"`。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run web:test -- web/src/ui/__tests__/DropdownMenu.test.tsx web/src/workspace/__tests__/ScopeDropdown.test.tsx`

Expected: FAIL

- [ ] **Step 3: 实现 dropdown-menu.tsx（参考 shadcn 结构，CSS var 样式）**

```tsx
// web/src/ui/dropdown-menu.tsx
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal;

export const DropdownMenuContent = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className = "", sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={`ui-dropdown-content ${className}`.trim()}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";

export const DropdownMenuItem = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Item>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>
>(({ className = "", ...props }, ref) => (
  <DropdownMenuPrimitive.Item ref={ref} className={`ui-dropdown-item ${className}`.trim()} {...props} />
));
DropdownMenuItem.displayName = "DropdownMenuItem";

export const DropdownMenuLabel = DropdownMenuPrimitive.Label;
export const DropdownMenuSeparator = DropdownMenuPrimitive.Separator;
export const DropdownMenuCheckboxItem = DropdownMenuPrimitive.CheckboxItem;
```

`ui.css` 追加：

```css
.ui-dropdown-content {
  z-index: var(--z-dropdown);
  min-width: 240px;
  background: var(--paper-craft);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-soft);
  padding: var(--space-1) 0;
  animation: kb-fade-in-up var(--duration-fast) var(--ease-out);
}
.ui-dropdown-item {
  font-size: var(--text-body-size);
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
  outline: none;
}
.ui-dropdown-item[data-highlighted] { background: var(--bg-hover); }
```

- [ ] **Step 4: 重写 ScopeDropdown（删除 createPortal + manual fixed）**

核心结构：

```tsx
<DropdownMenu open={open} onOpenChange={(v) => !v && onToggle()}>
  <DropdownMenuTrigger asChild>
    <button type="button" className="scope-badge" onClick={onToggle}>…</button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="start" data-testid="scope-dropdown-content">
    <DropdownMenuLabel className="text-caption">选择本会话检索的文档</DropdownMenuLabel>
    {docs.map(...CheckboxItem or Item...)}
  </DropdownMenuContent>
</DropdownMenu>
```

`ContextRefBar` picker 同样模式；删除 inline `position: fixed` style。

- [ ] **Step 5: 更新 ui/index.ts export**

- [ ] **Step 6: 运行测试确认通过**

Run: `npm run web:test -- web/src/ui/__tests__/DropdownMenu.test.tsx web/src/workspace/__tests__/ScopeDropdown.test.tsx`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add web/src/ui web/src/workspace/ScopeDropdown.tsx web/src/workspace/ContextRefBar.tsx web/src/workspace/__tests__/ScopeDropdown.test.tsx
git commit -m "feat(ui): radix dropdown for scope and context pickers"
```

---

### Task 6: CommandPalette 迁移 cmdk

**Files:**
- Modify: `web/src/workspace/CommandPalette.tsx`
- Create: `web/src/workspace/__tests__/CommandPalette.test.tsx`
- Modify: `web/src/ui/ui.css`

- [ ] **Step 1: 写失败测试**

```tsx
// web/src/workspace/__tests__/CommandPalette.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CommandPalette } from "../CommandPalette.js";

vi.mock("../../api.js", () => ({
  api: { search: vi.fn().mockResolvedValue({ results: [] }), getDoc: vi.fn() },
}));
vi.mock("../WorkspaceStore.js", () => ({
  useWorkspace: () => ({ dispatch: vi.fn() }),
}));
vi.mock("../../components/Toast.js", () => ({ useToast: () => vi.fn() }));

describe("CommandPalette", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("UV3: opens with cmdk root", async () => {
    render(<CommandPalette />);
    await userEvent.keyboard("{Meta>}k{/Meta}");
    expect(document.querySelector("[cmdk-root]")).toBeTruthy();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run web:test -- web/src/workspace/__tests__/CommandPalette.test.tsx`

Expected: FAIL — no cmdk-root

- [ ] **Step 3: 重写 CommandPalette**

```tsx
import { Command } from "cmdk";
// 保留现有 useEffect 快捷键与 debounce api.search 逻辑
// JSX:
<div className="cmdk-overlay" onClick={() => setOpen(false)}>
  <Command className="cmdk-panel" label="搜索知识库">
    <div className="cmdk-input-wrap">
      <Command.Input className="cmdk-input" value={q} onValueChange={setQ} placeholder="搜索知识库（⌘K）…" />
    </div>
    <Command.List className="cmdk-results">
      {loading && <Command.Loading>搜索中…</Command.Loading>}
      {results.map((r, i) => (
        <Command.Item key={r.docId ?? i} value={r.docTitle} onSelect={() => openDoc(r.docId)}>
          <div className="cmdk-title">{r.docTitle}</div>
          <div className="cmdk-snippet">{(r.text || "").slice(0, 100)}</div>
        </Command.Item>
      ))}
    </Command.List>
  </Command>
</div>
```

`ui.css` 追加 `[cmdk-item][data-selected=true]` 高亮规则。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run web:test -- web/src/workspace/__tests__/CommandPalette.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/workspace/CommandPalette.tsx web/src/workspace/__tests__/CommandPalette.test.tsx web/src/ui/ui.css
git commit -m "feat(cmdk): migrate command palette to cmdk with paper styling"
```

---

### Task 7: Icons.tsx → lucide-react 再导出

**Files:**
- Modify: `web/src/Icons.tsx`
- Create: `web/src/__tests__/Icons.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
// web/src/__tests__/Icons.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { IconSearch, IconPlus } from "../Icons.js";

describe("Icons lucide re-export", () => {
  it("renders SVG from lucide", () => {
    const { container } = render(<IconSearch size={16} />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelector("svg")?.getAttribute("width")).toBe("16");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**（若已手写 SVG 仍 pass，则改断言检查 `lucide` class 或 stroke-width 默认）

- [ ] **Step 3: 替换 Icons.tsx 为 thin wrapper**

```tsx
import {
  MessageSquare as IconChat,
  Library as IconLibrary,
  FileText as IconNote,
  Search as IconSearch,
  Settings as IconSettings,
  Plus as IconPlus,
  Send as IconSend,
  BookOpen as IconBook,
  File as IconFile,
  Upload as IconUpload,
  Trash2 as IconTrash,
  Wrench as IconTool,
  Music2 as IconSource,
  Check as IconCheck,
  AlertCircle as IconAlert,
  Loader2 as IconSpinner,
  // ... 其余按现有 export 名映射
} from "lucide-react";
import type { LucideProps } from "lucide-react";

const withDefaults = (Icon: React.FC<LucideProps>) =>
  function Wrapped({ size = 20, strokeWidth = 1.75, ...props }: LucideProps) {
    return <Icon size={size} strokeWidth={strokeWidth} {...props} />;
  };

export const IconSearch = withDefaults(Search);
// 或简单 re-export + 文档说明默认 props
export { IconChat, IconLibrary, /* ... */ };
```

保持 **所有现有 export 名** 不变。

- [ ] **Step 4: 运行测试 + 抽样 workspace 测试**

Run: `npm run web:test -- web/src/__tests__/Icons.test.tsx web/src/workspace/__tests__/FileTree.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/Icons.tsx web/src/__tests__/Icons.test.tsx
git commit -m "refactor(icons): re-export lucide-react with stable Icon* names"
```

---

### Task 8: Side Peek motion + 列表淡入

**Files:**
- Modify: `web/src/workspace/craft/SourcePeek.tsx`
- Modify: `web/src/workspace/FilePeekPanel.tsx`（若存在 peek class）
- Modify: `web/src/workspace/layout.css`
- Modify: `web/src/workspace/SidebarSection.tsx` 或 `FileTree.tsx`（列表项 `kb-animate-in`）

- [ ] **Step 1: layout.css 为 peek 面板加 class**

```css
.ws-side-peek-panel { /* 已有则合并 */ transform: translateX(0); }
.ws-side-peek-panel.is-closed { transform: translateX(100%); }
```

- [ ] **Step 2: SourcePeek / FilePeek 挂载时加 `ws-side-peek-panel`**

- [ ] **Step 3: 侧栏 section list li 加 `kb-animate-in`（可选 stagger 用 animation-delay inline 仅 index*20ms）**

- [ ] **Step 4: 手动验证 + web:test 全量**

Run: `npm run web:test`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/workspace/craft/SourcePeek.tsx web/src/workspace/FilePeekPanel.tsx web/src/workspace/layout.css web/src/workspace/FileTree.tsx
git commit -m "feat(motion): side peek slide and sidebar list fade-in"
```

---

### Task 9: Inline style 收敛（workspace 范围）

**Files:**
- Modify: `web/src/workspace/ChatPane.tsx`
- Modify: `web/src/workspace/WorkspaceShell.tsx`

- [ ] **Step 1: ChatPane — 替换可静态 class 的 inline style**

```tsx
// 前: style={{ gap: 10, flex: 1 }}
<div className="row gap-3" style={{ flex: 1 }}>
// 前: style={{ fontSize: 12, gap: 4 }}
<div className="row muted text-caption gap-2">
```

保留 activity `cursor: pointer` 等动态 style。

- [ ] **Step 2: WorkspaceShell — email / 设置按钮用 text-caption / ui Button ghost**

- [ ] **Step 3: 全量测试 + 构建**

Run: `npm run web:test && npm run web:build`

Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add web/src/workspace/ChatPane.tsx web/src/workspace/WorkspaceShell.tsx
git commit -m "style(workspace): replace inline typography spacing with token utilities"
```

---

### Task 10: AGENTS.md 例外 + 集成验收

**Files:**
- Modify: `web/AGENTS.md`
- Create: `web/src/workspace/__tests__/UiPolish.integration.test.tsx`

- [ ] **Step 1: AGENTS.md 增加「允许的轻量 primitive」小节**

说明：Radix dropdown/dialog、cmdk、lucide-react；禁止 Tailwind/shadcn CLI。

- [ ] **Step 2: 集成测试 UV1–UV3 smoke**

```tsx
describe("UI polish v2 integration", () => {
  it("FileTree uses Badge", async () => { /* render FileTree, expect 处理中, no ⏳ */ });
});
```

- [ ] **Step 3: 全量验证**

Run: `npm run web:test && npm run web:build`

- [ ] **Step 4: Commit**

```bash
git add web/AGENTS.md web/src/workspace/__tests__/UiPolish.integration.test.tsx
git commit -m "docs(web): document ui primitive exceptions; add polish integration test"
```

---

## Agent Prompts（三套）

### Prompt A — 验收

```markdown
Spec: docs/superpowers/specs/2026-06-27-kb-ui-polish-v2-design.md
Plan: docs/superpowers/plans/2026-06-27-kb-ui-polish-v2.md
npm run web:test && npm run web:build
验证 UV1–UV6、US1–US3；FileTree 无 emoji；ScopeDropdown Tab/Esc；⌘K cmdk 箭头键
```

### Prompt B — Task 1→10 顺序实现

```markdown
严格按 docs/superpowers/plans/2026-06-27-kb-ui-polish-v2.md 执行。确认 apple-sidebar 与 context-picker 已 merged 后开始 Task 1。
```

### Prompt C — 单 Task

```markdown
只执行 UI polish v2 plan Task {N}。禁止改 SSE/后端/markstream 时机。
```

---

## Self-Review

**Spec coverage:** UV1–UV6、US1–US3 全映射 Task 1–10 ✓  
**Placeholder scan:** 无 TBD ✓  
**Dependency boundary:** 仅 5 个 npm 包，无 Tailwind ✓  
**Icons API:** 稳定 `Icon*` export，调用方零改动 ✓  
**Prerequisite:** apple-sidebar + context-picker 先 merged ✓

---

## 执行方式（二选一）

1. **Subagent-Driven（推荐）** — 每 Task 派生子 agent，Task 间人工 review  
2. **Inline Execution** — 本会话连续执行 Task 1–10

请确认执行方式后开始实现。
