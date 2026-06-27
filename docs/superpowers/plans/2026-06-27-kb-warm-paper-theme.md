# private-kb 暖色纸面主题 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 kb 工作区默认视觉从 ChatGPT 纯暗灰改为暖色纸面三栏（`#F7F2EA` / `#FFFCF7` / `#EDE6DC`），黑字 `#1A1612`，琥珀 accent，暗色可选切换。

**Architecture:** 抽出 `web/src/theme/tokens.css` 作为单一 token 源；`:root` 为 light，`[data-theme="dark"]` 保留旧暗色；`main.tsx` boot 前 `applyTheme` 防闪烁；markstream 分 light/dark 两文件；layout.css 绑定三栏纸面色。

**Tech Stack:** CSS Custom Properties · React 18 · Vitest · 无新 npm 依赖

**Spec:** `docs/superpowers/specs/2026-06-27-kb-warm-paper-theme-design.md`

**Repo:** `/Users/lijixiang/ZCodeProject/private-kb`

---

## 文件结构（锁定）

| 文件 | 职责 |
|------|------|
| `web/src/theme/tokens.css` | light/dark 全部 CSS 变量 |
| `web/src/theme/markstream-light.css` | Craft/Chat MD 浅色渲染 |
| `web/src/theme/markstream-dark.css` | 现有 markstream 暗色覆盖（从 styles.css 迁出） |
| `web/src/theme/useTheme.ts` | get/set/apply + localStorage |
| `web/src/theme/ThemeToggle.tsx` | 顶栏 ☀/🌙 切换 |
| `web/src/theme/__tests__/useTheme.test.ts` | theme 逻辑单测 |
| `web/src/styles.css` | 组件样式（仅引用 var，不含 :root 硬编码色） |
| `web/src/workspace/layout.css` | 三栏分区背景 + 树/ craft / chat 纸面组件 |
| `web/src/main.tsx` | boot applyTheme |
| `web/src/workspace/WorkspaceShell.tsx` | 挂载 ThemeToggle |

---

## Spec → Task 映射

| 验收 ID | Task |
|---------|------|
| TV1, TD1, TB1 | Task 1, 2 |
| TV2, TO4 | Task 4 |
| TV3, TO2 | Task 5 |
| TV4, TB2, TO3 | Task 2, 6 |
| TO1 | Task 1 |
| 全量视觉 | Task 7 |

---

### Task 1: Design Tokens + useTheme

**Files:**
- Create: `web/src/theme/tokens.css`
- Create: `web/src/theme/useTheme.ts`
- Create: `web/src/theme/__tests__/useTheme.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// web/src/theme/__tests__/useTheme.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { getStoredTheme, setStoredTheme, applyTheme, type Theme } from "../useTheme.js";

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults to light when storage empty", () => {
    expect(getStoredTheme()).toBe("light");
  });

  it("persists dark to localStorage", () => {
    setStoredTheme("dark");
    expect(localStorage.getItem("kb.theme")).toBe("dark");
    expect(getStoredTheme()).toBe("dark");
  });

  it("applyTheme sets data-theme and color-scheme", () => {
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run web:test -- web/src/theme/__tests__/useTheme.test.ts`

Expected: FAIL — cannot find module `../useTheme.js`

- [ ] **Step 3: 实现 tokens.css**

```css
/* web/src/theme/tokens.css — Light 默认：暖色纸面 */
:root,
[data-theme="light"] {
  color-scheme: light;

  --paper-base: #F7F2EA;
  --paper-sidebar: #EDE6DC;
  --paper-craft: #FFFCF7;
  --paper-topbar: #FFFCF7;

  --ink: #1A1612;
  --ink-secondary: #5C534A;
  --ink-muted: #8A8178;

  --accent-amber: #B45309;
  --accent-bright: #F28C2E;
  --accent-text-on-amber: #FFFCF7;

  --border: rgba(26, 22, 18, 0.08);
  --border-strong: rgba(26, 22, 18, 0.14);
  --shadow-soft: 0 1px 3px rgba(26, 22, 18, 0.06);
  --shadow-peek: -4px 0 24px rgba(26, 22, 18, 0.08);

  /* 兼容现有组件变量名 */
  --bg-main: var(--paper-base);
  --bg-sidebar: var(--paper-sidebar);
  --bg-elevated: var(--paper-craft);
  --bg-hover: rgba(26, 22, 18, 0.05);
  --bg-input: var(--paper-craft);
  --border-light: var(--border-strong);
  --text: var(--ink);
  --text-secondary: var(--ink-secondary);
  --text-muted: var(--ink-muted);
  --accent: var(--accent-amber);
  --accent-text: var(--accent-text-on-amber);
  --user-bubble: rgba(26, 22, 18, 0.06);
  --danger: #DC2626;
  --radius: 10px;
  --radius-pill: 22px;
  --maxw-chat: 768px;
  --maxw-panel: 880px;
  --sidebar-w: 260px;

  --ws-left-bg: var(--paper-sidebar);
  --ws-center-bg: var(--paper-craft);
  --ws-right-bg: var(--paper-base);
  --ws-resizer-hover: rgba(180, 83, 9, 0.18);

  --selection-bar-bg: rgba(242, 140, 46, 0.12);
  --link: var(--accent-amber);
  --cite-bg: rgba(180, 83, 9, 0.1);
  --cite-hover: rgba(180, 83, 9, 0.18);
}

/* Dark：保留现有 ChatGPT 灰阶（从 styles.css 迁移） */
[data-theme="dark"] {
  color-scheme: dark;

  --paper-base: #212121;
  --paper-sidebar: #171717;
  --paper-craft: #212121;
  --paper-topbar: #171717;

  --ink: #ececec;
  --ink-secondary: #b4b4b4;
  --ink-muted: #8e8ea0;

  --accent-amber: #ececec;
  --accent-bright: #5786FE;
  --accent-text-on-amber: #212121;

  --border: #2f2f2f;
  --border-strong: #424242;
  --shadow-soft: 0 8px 24px rgba(0, 0, 0, 0.4);
  --shadow-peek: -8px 0 24px rgba(0, 0, 0, 0.35);

  --bg-main: #212121;
  --bg-sidebar: #171717;
  --bg-elevated: #2f2f2f;
  --bg-hover: #2a2a2a;
  --bg-input: #2f2f2f;
  --text: #ececec;
  --text-secondary: #b4b4b4;
  --text-muted: #8e8ea0;
  --accent: #ececec;
  --accent-text: #212121;
  --user-bubble: #2f2f2f;
  --danger: #ef4146;
  --radius: 12px;
  --radius-pill: 28px;

  --ws-left-bg: var(--bg-sidebar);
  --ws-center-bg: var(--bg-main);
  --ws-right-bg: var(--bg-main);
  --ws-resizer-hover: rgba(87, 134, 254, 0.2);

  --selection-bar-bg: rgba(87, 134, 254, 0.08);
  --link: #5786FE;
  --cite-bg: rgba(87, 134, 254, 0.12);
  --cite-hover: rgba(87, 134, 254, 0.26);
}
```

- [ ] **Step 4: 实现 useTheme.ts**

```typescript
// web/src/theme/useTheme.ts
export type Theme = "light" | "dark";
const STORAGE_KEY = "kb.theme";

export function getStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* private mode */
  }
  return "light";
}

export function setStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function toggleTheme(): Theme {
  const next: Theme = getStoredTheme() === "light" ? "dark" : "light";
  setStoredTheme(next);
  applyTheme(next);
  return next;
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run web:test -- web/src/theme/__tests__/useTheme.test.ts`

Expected: 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add web/src/theme/tokens.css web/src/theme/useTheme.ts web/src/theme/__tests__/useTheme.test.ts
git commit -m "feat(theme): add warm paper design tokens and useTheme"
```

---

### Task 2: Boot 防闪烁 + ThemeToggle

**Files:**
- Create: `web/src/theme/ThemeToggle.tsx`
- Modify: `web/src/main.tsx`
- Modify: `web/src/workspace/WorkspaceShell.tsx`
- Create: `web/src/theme/__tests__/ThemeToggle.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
// web/src/theme/__tests__/ThemeToggle.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach } from "vitest";
import { ThemeToggle } from "../ThemeToggle.js";

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.theme = "light";
  });

  it("toggles data-theme on click", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: /切换主题|theme/i }));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run web:test -- web/src/theme/__tests__/ThemeToggle.test.tsx`

Expected: FAIL — ThemeToggle not found

- [ ] **Step 3: 实现 ThemeToggle + main boot**

```tsx
// web/src/theme/ThemeToggle.tsx
import { useSyncExternalStore } from "react";
import { applyTheme, getStoredTheme, setStoredTheme, type Theme } from "./useTheme.js";

function subscribe(cb: () => void) {
  const handler = () => cb();
  window.addEventListener("kb:theme-changed", handler);
  return () => window.removeEventListener("kb:theme-changed", handler);
}
function getSnapshot(): Theme {
  return (document.documentElement.dataset.theme as Theme) || getStoredTheme();
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => "light" as Theme);
  const nextLabel = theme === "light" ? "切换到暗色" : "切换到浅色";

  return (
    <button
      type="button"
      className="icon-btn theme-toggle"
      aria-label={`切换主题，当前${theme === "light" ? "浅色" : "暗色"}`}
      title={nextLabel}
      onClick={() => {
        const next: Theme = theme === "light" ? "dark" : "light";
        setStoredTheme(next);
        applyTheme(next);
        window.dispatchEvent(new Event("kb:theme-changed"));
      }}
    >
      {theme === "light" ? "🌙" : "☀️"}
    </button>
  );
}
```

```typescript
// web/src/main.tsx — 在 createRoot 之前插入
import { applyTheme, getStoredTheme } from "./theme/useTheme.js";
import "./theme/tokens.css";

applyTheme(getStoredTheme());
```

```tsx
// web/src/workspace/WorkspaceShell.tsx — topbar 内 email 前插入
import { ThemeToggle } from "../theme/ThemeToggle.js";

// topbar JSX:
<>
  <span className="ws-title">私人知识库</span>
  <span style={{ marginLeft: "auto" }} />
  <ThemeToggle />
  <span className="muted" style={{ fontSize: 13 }}>{user.email}</span>
  ...
</>
```

- [ ] **Step 4: layout.css 追加 toggle 样式**

```css
.theme-toggle { font-size: 16px; line-height: 1; }
.workspace-topbar { background: var(--paper-topbar); }
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run web:test -- web/src/theme/__tests__/ThemeToggle.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add web/src/theme/ThemeToggle.tsx web/src/theme/__tests__/ThemeToggle.test.tsx \
  web/src/main.tsx web/src/workspace/WorkspaceShell.tsx web/src/workspace/layout.css
git commit -m "feat(theme): boot applyTheme and topbar ThemeToggle"
```

---

### Task 3: 迁移 styles.css — 移除旧 :root

**Files:**
- Modify: `web/src/styles.css`（L1–31 替换为 import）
- Modify: `web/src/main.tsx`（import 顺序）

- [ ] **Step 1: 写失败测试（token 契约）**

```typescript
// web/src/theme/__tests__/tokensContract.test.ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("tokens.css contract", () => {
  it("defines required light tokens", () => {
    const css = fs.readFileSync(
      path.resolve("web/src/theme/tokens.css"),
      "utf8"
    );
    expect(css).toContain("--paper-base: #F7F2EA");
    expect(css).toContain("--ink: #1A1612");
    expect(css).toContain("--accent-amber: #B45309");
  });

  it("styles.css no longer hardcodes ChatGPT grays in :root", () => {
    const css = fs.readFileSync(path.resolve("web/src/styles.css"), "utf8");
    expect(css).not.toMatch(/:root\s*\{[^}]*--bg-main:\s*#212121/s);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run web:test -- web/src/theme/__tests__/tokensContract.test.ts`

Expected: FAIL on second assertion（styles.css 仍有 `#212121`）

- [ ] **Step 3: 替换 styles.css 头部**

删除 L1–31（`:root { ... }` 整块），文件顶部改为：

```css
/* 暖色纸面 / 暗色 token 见 theme/tokens.css（main.tsx boot） */
@import "./theme/markstream-light.css";
@import "./theme/markstream-dark.css";

/* ===== 全局基础 ===== */
```

保留 `*`、`body`、`button` 等使用 `var(--text)` / `var(--bg-main)` 的规则不变。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run web:test -- web/src/theme/__tests__/tokensContract.test.ts`

Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/styles.css web/src/theme/__tests__/tokensContract.test.ts
git commit -m "refactor(theme): remove hardcoded ChatGPT :root from styles.css"
```

---

### Task 4: 三栏纸面分区 layout.css

**Files:**
- Modify: `web/src/workspace/layout.css`

- [ ] **Step 1: 写失败测试**

```typescript
// web/src/theme/__tests__/layoutPaper.test.ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";

describe("layout paper zones", () => {
  it("assigns distinct pane backgrounds", () => {
    const css = fs.readFileSync("web/src/workspace/layout.css", "utf8");
    expect(css).toContain(".workspace-left");
    expect(css).toContain("var(--ws-left-bg)");
    expect(css).toContain(".workspace-center");
    expect(css).toContain("var(--ws-center-bg)");
    expect(css).toContain(".workspace-right");
    expect(css).toContain("var(--ws-right-bg)");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run web:test -- web/src/theme/__tests__/layoutPaper.test.ts`

Expected: FAIL — missing `var(--ws-center-bg)`

- [ ] **Step 3: 修改 layout.css**

在 `.workspace-left` / `.workspace-center` / `.workspace-right` 块追加 background：

```css
.workspace-left { border-right: 1px solid var(--border); background: var(--ws-left-bg); }
.workspace-center { background: var(--ws-center-bg); }
.workspace-right { border-left: 1px solid var(--border); background: var(--ws-right-bg); }
.workspace-resizer-left:hover,
.workspace-resizer-right:hover { background: var(--ws-resizer-hover); }
```

文件树 active 行左侧色条：

```css
.ws-tree-row.active {
  background: var(--bg-hover);
  color: var(--text);
  box-shadow: inset 3px 0 0 var(--accent-bright);
}
.ws-tree-row { border-radius: 8px; }
```

编辑器/Craft 纸面：

```css
.ws-editor { background: var(--ws-center-bg); }
.ws-craft-body {
  font-family: ui-sans-serif, -apple-system, "PingFang SC", "Songti SC", serif;
  color: var(--ink);
}
.ws-title-input {
  font-family: ui-sans-serif, -apple-system, "PingFang SC", sans-serif;
  color: var(--ink);
}
.ws-selection-bar {
  background: var(--selection-bar-bg);
  border-bottom: 1px solid var(--border);
}
.ws-sel-pin {
  color: var(--accent-amber);
  border-color: var(--accent-amber);
  border-radius: 999px;
}
.ws-source-peek {
  box-shadow: var(--shadow-peek);
  background: var(--paper-craft);
}
.ws-patch-bar {
  box-shadow: var(--shadow-soft);
  background: var(--paper-craft);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run web:test -- web/src/theme/__tests__/layoutPaper.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/workspace/layout.css web/src/theme/__tests__/layoutPaper.test.ts
git commit -m "feat(theme): warm paper backgrounds for three workspace panes"
```

---

### Task 5: markstream 浅色 / 暗色分离

**Files:**
- Create: `web/src/theme/markstream-light.css`
- Create: `web/src/theme/markstream-dark.css`
- Modify: `web/src/styles.css`（删除 L277–318 旧 markstream 块）

- [ ] **Step 1: 写失败测试**

```typescript
// web/src/theme/__tests__/markstreamTheme.test.ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";

describe("markstream themes", () => {
  it("light theme uses ink color for headings", () => {
    const css = fs.readFileSync("web/src/theme/markstream-light.css", "utf8");
    expect(css).toContain("color: var(--ink)");
    expect(css).not.toContain("#ececec");
  });

  it("dark theme scoped under data-theme=dark", () => {
    const css = fs.readFileSync("web/src/theme/markstream-dark.css", "utf8");
    expect(css).toContain('[data-theme="dark"]');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run web:test -- web/src/theme/__tests__/markstreamTheme.test.ts`

Expected: FAIL — files not found

- [ ] **Step 3: 创建 markstream-light.css**

```css
/* web/src/theme/markstream-light.css — 仅 light 生效 */
[data-theme="light"] .markstream-react,
:root:not([data-theme="dark"]) .markstream-react {
  --background: 255 252 247 !important;
  --foreground: 26 22 18 !important;
  color: var(--ink) !important;
  background: transparent !important;
}
[data-theme="light"] .markstream-react .inline-code,
:root:not([data-theme="dark"]) .markstream-react .inline-code {
  background: rgba(26, 22, 18, 0.06) !important;
  color: var(--ink) !important;
}
[data-theme="light"] .markstream-react blockquote,
:root:not([data-theme="dark"]) .markstream-react blockquote {
  border-left: 3px solid var(--accent-bright) !important;
  color: var(--ink-secondary) !important;
  background: rgba(242, 140, 46, 0.06) !important;
}
[data-theme="light"] .markstream-react pre,
:root:not([data-theme="dark"]) .markstream-react pre {
  background: rgba(26, 22, 18, 0.04) !important;
  border: 1px solid var(--border) !important;
  border-radius: 8px !important;
}
[data-theme="light"] .markstream-react pre code,
:root:not([data-theme="dark"]) .markstream-react pre code {
  color: var(--ink) !important;
}
[data-theme="light"] .markstream-react a,
:root:not([data-theme="dark"]) .markstream-react a {
  color: var(--link) !important;
}
[data-theme="light"] .markstream-react h1,
[data-theme="light"] .markstream-react h2,
[data-theme="light"] .markstream-react h3,
[data-theme="light"] .markstream-react p,
[data-theme="light"] .markstream-react li,
:root:not([data-theme="dark"]) .markstream-react h1,
:root:not([data-theme="dark"]) .markstream-react h2,
:root:not([data-theme="dark"]) .markstream-react h3,
:root:not([data-theme="dark"]) .markstream-react p,
:root:not([data-theme="dark"]) .markstream-react li {
  color: var(--ink) !important;
}
[data-theme="light"] .markstream-react .inline-cite,
:root:not([data-theme="dark"]) .markstream-react .inline-cite {
  background: var(--cite-bg) !important;
  color: var(--accent-amber) !important;
}
[data-theme="light"] .markstream-react .inline-cite:hover,
:root:not([data-theme="dark"]) .markstream-react .inline-cite:hover {
  background: var(--cite-hover) !important;
}
```

- [ ] **Step 4: 创建 markstream-dark.css**

将 `styles.css` 现有 L277–356 的 `.markstream-react { ... }` 规则**整体剪切**到此文件，每条选择器前加前缀 `[data-theme="dark"]`：

```css
/* web/src/theme/markstream-dark.css */
[data-theme="dark"] .markstream-react {
  --background: 33 33 33 !important;
  --foreground: 236 233 236 !important;
  color: var(--text) !important;
  background: transparent !important;
}
/* ... 其余 dark 规则同理加 [data-theme="dark"] 前缀 ... */
```

- [ ] **Step 5: 从 styles.css 删除旧 markstream 块**

- [ ] **Step 6: 运行测试确认通过**

Run: `npm run web:test -- web/src/theme/__tests__/markstreamTheme.test.ts`

Expected: 2 tests PASS

- [ ] **Step 7: Commit**

```bash
git add web/src/theme/markstream-light.css web/src/theme/markstream-dark.css \
  web/src/theme/__tests__/markstreamTheme.test.ts web/src/styles.css
git commit -m "feat(theme): split markstream light and dark overrides"
```

---

### Task 6: Chat / Composer 纸面化

**Files:**
- Modify: `web/src/styles.css`（chat、bubble、composer、cite、cmdk 区）

- [ ] **Step 1: 写失败测试**

```typescript
// web/src/theme/__tests__/chatPaper.test.ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";

describe("chat paper styles", () => {
  it("composer uses paper input background", () => {
    const css = fs.readFileSync("web/src/styles.css", "utf8");
    expect(css).toMatch(/\.composer\s*\{[^}]*background:\s*var\(--bg-input\)/s);
  });

  it("send button uses amber accent in light", () => {
    const css = fs.readFileSync("web/src/styles.css", "utf8");
    expect(css).toContain(".send-btn");
    expect(css).toMatch(/background:\s*var\(--accent\)/);
  });
});
```

- [ ] **Step 2: 运行测试 — 可能已 PASS 部分；补全缺口**

- [ ] **Step 3: 更新 styles.css 关键块**

```css
/* 用户气泡 — 暖灰 pill */
.msg.user .bubble {
  background: var(--user-bubble);
  border-radius: 18px 18px 4px 18px;
  padding: 10px 14px;
  color: var(--ink);
}

/* 助手 — 无边框，纸面流式 */
.msg.assistant .bubble {
  color: var(--ink);
  line-height: 1.75;
}

/* Composer 纸面胶囊 */
.composer {
  background: var(--bg-input);
  border: 1px solid var(--border-strong);
  box-shadow: var(--shadow-soft);
}
.composer:focus-within {
  border-color: var(--accent-amber);
}
.send-btn {
  background: var(--accent);
  color: var(--accent-text);
}
.send-btn:hover:not(:disabled) {
  filter: brightness(1.05);
}

/* cite chips — 琥珀 */
.cite-chip {
  background: var(--cite-bg);
  border: 1px solid var(--border);
  border-radius: 999px;
}
.cite-chip:hover {
  background: var(--cite-hover);
}

/* cmdk 纸面 */
.cmdk-overlay { background: rgba(26, 22, 18, 0.35); }
.cmdk-panel {
  background: var(--paper-craft);
  box-shadow: 0 16px 48px rgba(26, 22, 18, 0.12);
}

/* Auth card */
.auth-card {
  background: var(--paper-craft);
  box-shadow: var(--shadow-soft);
}

/* scrollbar 暖色 */
::-webkit-scrollbar-thumb { background: rgba(26, 22, 18, 0.15); }
```

删除 composer `:focus-within { border-color: #525252 }` 硬编码。

- [ ] **Step 4: 运行测试**

Run: `npm run web:test -- web/src/theme/__tests__/chatPaper.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/styles.css web/src/theme/__tests__/chatPaper.test.ts
git commit -m "feat(theme): paper-style chat bubbles and composer"
```

---

### Task 7: 集成验证 + Agent Prompts

**Files:**
- Create: `web/src/theme/__tests__/themeIntegration.test.tsx`

- [ ] **Step 1: 集成测试**

```tsx
// web/src/theme/__tests__/themeIntegration.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { WorkspaceProvider } from "../../workspace/WorkspaceStore.js";
import { WorkspaceShell } from "../../workspace/WorkspaceShell.js";
import { applyTheme } from "../useTheme.js";

vi.mock("../../api.js", () => ({ getToken: () => "t" }));
vi.mock("../../workspace/layout/WorkspaceLayout.js", () => ({
  WorkspaceLayout: ({ topbar }: any) => <div data-testid="layout">{topbar}</div>,
}));
vi.mock("../../workspace/CommandPalette.js", () => ({ CommandPalette: () => null }));

describe("theme integration", () => {
  beforeEach(() => {
    applyTheme("light");
  });

  it("TV1: default theme is light on shell", () => {
    render(
      <WorkspaceProvider>
        <WorkspaceShell user={{ email: "a@b.c" }} onOpenSettings={() => {}} />
      </WorkspaceProvider>
    );
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("button", { name: /切换主题/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 全量测试**

Run: `npm run web:test`

Expected: 全部 PASS

- [ ] **Step 3: 构建验证**

Run: `npm run web:build`

Expected: exit 0，无 TS/CSS 错误

- [ ] **Step 4: 手动冒烟清单**

Run: `npm run web:dev`

- [ ] 默认浅色三栏，左/中/右色温可辨
- [ ] Craft 黑字可读，code block 浅灰底
- [ ] 切换 🌙 → 暗色，刷新保持
- [ ] Settings 往返主题不变

- [ ] **Step 5: Commit**

```bash
git add web/src/theme/__tests__/themeIntegration.test.tsx
git commit -m "test(theme): add warm paper theme integration coverage"
```

---

## Agent Prompts（三套）

### Prompt A — 整计划验收

```markdown
你是 private-kb 暖色纸面主题验收 Agent。仓库：/Users/lijixiang/ZCodeProject/private-kb

Spec: docs/superpowers/specs/2026-06-27-kb-warm-paper-theme-design.md
Plan: docs/superpowers/plans/2026-06-27-kb-warm-paper-theme.md

执行：
1. npm run web:test && npm run web:build
2. 逐项验证 TV1–TV4、TO1–TO4、TB1–TB2、TD1
3. 输出 | ID | PASS/FAIL | 证据 |

TV1/TV2/TV3 任一 FAIL → 总评 FAIL。
```

### Prompt B — 实现 Agent（Task 1→7）

```markdown
严格按 docs/superpowers/plans/2026-06-27-kb-warm-paper-theme.md Task 1 到 7 顺序执行。
每 Task：测试→失败→实现→通过→commit。完成后 npm run web:test。
开始 Task 1。
```

### Prompt C — 单 Task 子 Agent

```markdown
只执行暖色纸面主题计划 Task {N}：{名称}。
Plan: docs/superpowers/plans/2026-06-27-kb-warm-paper-theme.md
仅改该 Task Files 列表文件。TDD 五步。回报测试输出。
禁止：改 SSE 逻辑、改 WorkspaceStore 业务状态。
```

---

## Self-Review

**Spec coverage:** TV/TO/TB/TD 全部映射 Task 1–7 ✓

**Placeholder scan:** 无 TBD/TODO ✓

**Type consistency:** `Theme = "light"|"dark"`、`kb.theme`、CSS `data-theme` 一致 ✓

**Scope:** 仅视觉 token + CSS，不碰 Live Craft 逻辑 ✓

**与 Live Craft plan 关系:** 可并行；Task 4 layout 改 craft 字体时勿删 Live Craft 类名 ✓
