# private-kb Markdown 精致排版 + TOC + 写作统计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bear/Notion 式精致 Markdown 排版（标题衬线阶梯/列表/代码块语言标签+复制/引用/表格）+ 中栏 TOC 大纲 + 写作统计，修复 CraftBody 主题 bug。

**Architecture:** CSS-first 排版写入 `theme/prose.css`；纯函数 `extractToc` / `computeStats` 可独立测试；`TocPanel` 用 IntersectionObserver 高亮；代码块增强用 MutationObserver 注入；不改 markstream-react / 后端 / schema。

**Tech Stack:** React 18 · Vitest · CSS Custom Properties · 纯函数 · IntersectionObserver

**Spec:** `docs/superpowers/specs/2026-06-27-kb-prose-toc-stats-design.md`

**Repo:** `/Users/lijixiang/ZCodeProject/private-kb`

---

## 文件结构（锁定）

| 文件 | 职责 |
|------|------|
| `web/src/theme/prose.css` | Bear/Notion 排版（标题/列表/代码/引用/表格），light scoped |
| `web/src/workspace/craft/extractToc.ts` | 纯函数：markdown → `{ level, text }[]` |
| `web/src/workspace/craft/computeStats.ts` | 纯函数：content → `{ chars, words, readTimeMin, paragraphs }` |
| `web/src/workspace/craft/__tests__/extractToc.test.ts` | TOC 提取单测 |
| `web/src/workspace/craft/__tests__/computeStats.test.ts` | 统计单测 |
| `web/src/workspace/craft/CraftBody.tsx` | 改：修 dark bug + 代码块复制 enhancer |
| `web/src/workspace/TocPanel.tsx` | 右浮大纲 + IntersectionObserver 高亮 |
| `web/src/workspace/EditorPane.tsx` | 改：集成 TocPanel + 写作统计 |
| `web/src/main.tsx` | 改：import prose.css |
| `web/src/workspace/layout.css` | 改：TOC + stats 样式 |

---

## Spec → Task 映射

| 验收 ID | Task |
|---------|------|
| PV1 | Task 1 |
| PV2, PO1, PO2, PO3 | Task 2 |
| PV3, PB2, PB3 | Task 3 |
| PV4, PB1 | Task 4, 5 |
| PO4 | Task 5 |
| 全量验证 | Task 6 |

---

### Task 1: 修复 CraftBody dark 写死 + prose.css 骨架

**Files:**
- Modify: `web/src/workspace/craft/CraftBody.tsx`
- Create: `web/src/theme/prose.css`
- Modify: `web/src/main.tsx`

- [ ] **Step 1: 修改 CraftBody — 用 useMarkstreamDark 替换写死 dark**

```tsx
// web/src/workspace/craft/CraftBody.tsx — 全文替换
import { useRef } from "react";
import MarkdownRender from "markstream-react";
import "markstream-react/index.css";
import "katex/dist/katex.min.css";
import { normalizeMath } from "./normalizeMath.js";
import { useMarkstreamDark } from "../../theme/useMarkstreamDark.js";

const MIN_PICK_LEN = 10;

interface Props {
  content: string;
  onOpenPeek: () => void;
  onPick: (text: string) => void;
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
}

/** 默认 Markdown 渲染层：双击开 SourcePeek，mouseup 选区 ≥10 字触发 onPick。 */
export function CraftBody({ content, onOpenPeek, onPick, scrollContainerRef }: Props) {
  const innerRef = useRef<HTMLDivElement>(null);
  const ref = scrollContainerRef ?? innerRef;
  const dark = useMarkstreamDark();

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
      <div className="ws-craft-inner markstream-react ws-prose">
        <MarkdownRender content={normalizeMath(content)} final={true} fade={false} dark={dark} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 prose.css 骨架（light scoped）**

```css
/* web/src/theme/prose.css — Bear/Notion 精致排版，仅 light 生效 */

/* ===== 标题层级 ===== */
[data-theme="light"] .ws-prose h1,
:root:not([data-theme="dark"]) .ws-prose h1 {
  font-size: 28px;
  font-weight: 650;
  letter-spacing: -0.02em;
  font-family: ui-serif, "Songti SC", Georgia, serif;
  margin: 0 0 16px;
  line-height: 1.3;
}
[data-theme="light"] .ws-prose h2,
:root:not([data-theme="dark"]) .ws-prose h2 {
  font-size: 22px;
  font-weight: 600;
  margin: 28px 0 12px;
  line-height: 1.35;
}
[data-theme="light"] .ws-prose h3,
:root:not([data-theme="dark"]) .ws-prose h3 {
  font-size: 18px;
  font-weight: 600;
  margin: 20px 0 8px;
}
[data-theme="light"] .ws-prose h4,
[data-theme="light"] .ws-prose h5,
[data-theme="light"] .ws-prose h6,
:root:not([data-theme="dark"]) .ws-prose h4,
:root:not([data-theme="dark"]) .ws-prose h5,
:root:not([data-theme="dark"]) .ws-prose h6 {
  font-size: 15px;
  font-weight: 600;
  margin: 16px 0 8px;
}

/* ===== 正文 ===== */
[data-theme="light"] .ws-prose p,
:root:not([data-theme="dark"]) .ws-prose p {
  margin: 0 0 16px;
  line-height: 1.75;
}
[data-theme="light"] .ws-prose strong,
:root:not([data-theme="dark"]) .ws-prose strong {
  font-weight: 650;
}
[data-theme="light"] .ws-prose em,
:root:not([data-theme="dark"]) .ws-prose em {
  font-style: italic;
}
[data-theme="light"] .ws-prose a,
:root:not([data-theme="dark"]) .ws-prose a {
  text-decoration: underline;
  text-underline-offset: 2px;
}
[data-theme="light"] .ws-prose hr,
:root:not([data-theme="dark"]) .ws-prose hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 32px 0;
}
```

- [ ] **Step 3: main.tsx 引入 prose.css**

在 `import "./theme/motion.css";` 之后加一行：

```tsx
import "./theme/prose.css";
```

- [ ] **Step 4: 构建验证**

Run: `npm run web:build`
Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add web/src/workspace/craft/CraftBody.tsx web/src/theme/prose.css web/src/main.tsx
git commit -m "fix(craft): use theme-aware dark prop and add prose.css skeleton"
```

---

### Task 2: 列表 + 引用 + 表格 + 代码块排版

**Files:**
- Modify: `web/src/theme/prose.css`

- [ ] **Step 1: 追加列表、引用、表格、代码块样式到 prose.css**

在 prose.css 末尾追加：

```css
/* ===== 列表 ===== */
[data-theme="light"] .ws-prose ul,
:root:not([data-theme="dark"]) .ws-prose ul {
  list-style: disc;
  padding-left: 24px;
  margin: 0 0 16px;
}
[data-theme="light"] .ws-prose ol,
:root:not([data-theme="dark"]) .ws-prose ol {
  list-style: decimal;
  padding-left: 24px;
  margin: 0 0 16px;
}
[data-theme="light"] .ws-prose li,
:root:not([data-theme="dark"]) .ws-prose li {
  margin-bottom: 6px;
  line-height: 1.7;
}
[data-theme="light"] .ws-prose li::marker,
:root:not([data-theme="dark"]) .ws-prose li::marker {
  color: var(--accent-bright);
}
[data-theme="light"] .ws-prose li > ul,
[data-theme="light"] .ws-prose li > ol,
:root:not([data-theme="dark"]) .ws-prose li > ul,
:root:not([data-theme="dark"]) .ws-prose li > ol {
  margin-top: 6px;
}

/* ===== 引用块 ===== */
[data-theme="light"] .ws-prose blockquote,
:root:not([data-theme="dark"]) .ws-prose blockquote {
  border-left: 3px solid var(--accent-bright);
  padding: 12px 16px;
  margin: 0 0 16px;
  background: rgba(242, 140, 46, 0.06);
  border-radius: 0 8px 8px 0;
  color: var(--ink-secondary);
}
[data-theme="light"] .ws-prose blockquote p:last-child,
:root:not([data-theme="dark"]) .ws-prose blockquote p:last-child {
  margin-bottom: 0;
}

/* ===== 表格 ===== */
[data-theme="light"] .ws-prose table,
:root:not([data-theme="dark"]) .ws-prose table {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 16px;
  font-size: 14px;
  display: block;
  overflow-x: auto;
}
[data-theme="light"] .ws-prose th,
:root:not([data-theme="dark"]) .ws-prose th {
  text-align: left;
  background: rgba(26, 22, 18, 0.04);
  font-weight: 600;
  padding: 8px 12px;
  border-bottom: 2px solid var(--border-strong);
}
[data-theme="light"] .ws-prose td,
:root:not([data-theme="dark"]) .ws-prose td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}
[data-theme="light"] .ws-prose tr:nth-child(even) td,
:root:not([data-theme="dark"]) .ws-prose tr:nth-child(even) td {
  background: rgba(26, 22, 18, 0.02);
}

/* ===== 代码块 ===== */
[data-theme="light"] .ws-prose pre,
:root:not([data-theme="dark"]) .ws-prose pre {
  position: relative;
  background: rgba(26, 22, 18, 0.04);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  overflow-x: auto;
  margin: 0 0 16px;
}
[data-theme="light"] .ws-prose pre code,
:root:not([data-theme="dark"]) .ws-prose pre code {
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 13px;
  line-height: 1.6;
  background: transparent;
  padding: 0;
}
[data-theme="light"] .ws-prose :not(pre) > code,
:root:not([data-theme="dark"]) .ws-prose :not(pre) > code {
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 13px;
  background: rgba(26, 22, 18, 0.06);
  padding: 2px 6px;
  border-radius: 4px;
}
```

- [ ] **Step 2: 构建验证**

Run: `npm run web:build`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add web/src/theme/prose.css
git commit -m "feat(prose): add list blockquote table code typography"
```

---

### Task 3: 代码块语言标签 + 复制按钮（MutationObserver）

**Files:**
- Modify: `web/src/workspace/craft/CraftBody.tsx`

- [ ] **Step 1: 在 CraftBody 加 useCodeBlockEnhancer hook**

在 `CraftBody.tsx` 的 import 之后、组件之前追加：

```tsx
/** MutationObserver：给渲染后的 pre 加语言标签 + 复制按钮。
 *  markstream 逐 token 渲染，DOM 持续变化，需 observer 持续增强。 */
function useCodeBlockEnhancer(containerRef: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const enhancePre = (pre: HTMLPreElement) => {
      if (pre.dataset.enhanced) return;
      pre.dataset.enhanced = "1";

      // 语言标签：从 code class 提取（markstream 给 code 加 language-xxx）
      const code = pre.querySelector("code");
      if (code) {
        const langClass = Array.from(code.classList).find((c) => c.startsWith("language-"));
        if (langClass) {
          pre.dataset.lang = langClass.replace("language-", "");
        }
      }

      // 复制按钮
      const btn = document.createElement("button");
      btn.className = "ws-copy-btn";
      btn.textContent = "复制";
      btn.setAttribute("aria-label", "复制代码");
      btn.addEventListener("click", () => {
        const text = pre.querySelector("code")?.textContent || "";
        navigator.clipboard.writeText(text).then(() => {
          btn.textContent = "已复制";
          setTimeout(() => { btn.textContent = "复制"; }, 2000);
        });
      });
      pre.appendChild(btn);
    };

    const observer = new MutationObserver(() => {
      el.querySelectorAll("pre").forEach((p) => enhancePre(p as HTMLPreElement));
    });
    observer.observe(el, { childList: true, subtree: true });
    // 初始增强
    el.querySelectorAll("pre").forEach((p) => enhancePre(p as HTMLPreElement));

    return () => observer.disconnect();
  }, [containerRef]);
}
```

需在文件顶部加 `import { useEffect, useRef } from "react";`（把 `useRef` 改为 `useEffect, useRef`）。

- [ ] **Step 2: 在组件内调用 hook**

在 `const dark = useMarkstreamDark();` 之后加：

```tsx
useCodeBlockEnhancer(ref);
```

- [ ] **Step 3: prose.css 追加语言标签 + 复制按钮样式**

在 prose.css 末尾追加：

```css
/* ===== 代码块语言标签 + 复制按钮 ===== */
[data-theme="light"] .ws-prose pre[data-lang]::before,
:root:not([data-theme="dark"]) .ws-prose pre[data-lang]::before {
  content: attr(data-lang);
  position: absolute;
  top: 8px;
  right: 12px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ink-muted);
  font-family: ui-monospace, monospace;
  pointer-events: none;
}
.ws-copy-btn {
  position: absolute;
  top: 8px;
  right: 12px;
  font-size: 11px;
  color: var(--ink-muted);
  background: rgba(26, 22, 18, 0.06);
  padding: 2px 8px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--duration-fast, 150ms);
  z-index: 1;
}
[data-theme="light"] .ws-prose pre[data-lang] .ws-copy-btn,
:root:not([data-theme="dark"]) .ws-prose pre[data-lang] .ws-copy-btn {
  right: 48px;
}
.ws-prose pre:hover .ws-copy-btn {
  opacity: 1;
}
```

- [ ] **Step 4: 构建验证**

Run: `npm run web:build`
Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add web/src/workspace/craft/CraftBody.tsx web/src/theme/prose.css
git commit -m "feat(craft): code block language label and copy button via MutationObserver"
```

---

### Task 4: extractToc 纯函数 + 单测

**Files:**
- Create: `web/src/workspace/craft/extractToc.ts`
- Create: `web/src/workspace/craft/__tests__/extractToc.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// web/src/workspace/craft/__tests__/extractToc.test.ts
import { describe, it, expect } from "vitest";
import { extractToc } from "../extractToc.js";

describe("extractToc", () => {
  it("extracts h1-h3 with levels", () => {
    const md = "# Title\n\n## Section A\n\ntext\n\n### Sub\n\n## Section B";
    const toc = extractToc(md);
    expect(toc).toEqual([
      { level: 1, text: "Title" },
      { level: 2, text: "Section A" },
      { level: 3, text: "Sub" },
      { level: 2, text: "Section B" },
    ]);
  });

  it("ignores h4-h6", () => {
    const md = "# H1\n\n#### H4\n\n##### H5";
    const toc = extractToc(md);
    expect(toc).toEqual([{ level: 1, text: "H1" }]);
  });

  it("ignores code blocks", () => {
    const md = "# Real\n\n```\n# Not a heading\n```\n\n## Also real";
    const toc = extractToc(md);
    expect(toc).toEqual([
      { level: 1, text: "Real" },
      { level: 2, text: "Also real" },
    ]);
  });

  it("returns empty for no headings", () => {
    expect(extractToc("just text\n\nno headings")).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run web:test -- web/src/workspace/craft/__tests__/extractToc.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 extractToc**

```typescript
// web/src/workspace/craft/extractToc.ts
export interface TocEntry {
  level: number;
  text: string;
}

const HEADING_RE = /^(#{1,3})\s+(.+)$/;

/** 从 markdown 提取 h1-h3 大纲。跳过代码块内的 # 行。 */
export function extractToc(markdown: string): TocEntry[] {
  const lines = markdown.split("\n");
  const result: TocEntry[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    const m = line.match(HEADING_RE);
    if (m) {
      result.push({ level: m[1].length, text: m[2].trim() });
    }
  }
  return result;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run web:test -- web/src/workspace/craft/__tests__/extractToc.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/workspace/craft/extractToc.ts web/src/workspace/craft/__tests__/extractToc.test.ts
git commit -m "feat(craft): add extractToc pure function with tests"
```

---

### Task 5: computeStats 纯函数 + 单测

**Files:**
- Create: `web/src/workspace/craft/computeStats.ts`
- Create: `web/src/workspace/craft/__tests__/computeStats.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// web/src/workspace/craft/__tests__/computeStats.test.ts
import { describe, it, expect } from "vitest";
import { computeStats } from "../computeStats.js";

describe("computeStats", () => {
  it("counts CJK + English words", () => {
    const s = computeStats("你好世界 hello world");
    expect(s.words).toBe(6); // 4 CJK + 2 English
  });

  it("estimates read time (300 wpm)", () => {
    const text = "字".repeat(600);
    const s = computeStats(text);
    expect(s.readTimeMin).toBe(2);
  });

  it("minimum 1 minute", () => {
    const s = computeStats("短文本");
    expect(s.readTimeMin).toBe(1);
  });

  it("counts paragraphs by double newline", () => {
    const s = computeStats("段落一\n\n段落二\n\n段落三");
    expect(s.paragraphs).toBe(3);
  });

  it("counts chars", () => {
    expect(computeStats("abc").chars).toBe(3);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run web:test -- web/src/workspace/craft/__tests__/computeStats.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 computeStats**

```typescript
// web/src/workspace/craft/computeStats.ts
export interface WritingStats {
  chars: number;
  words: number;
  readTimeMin: number;
  paragraphs: number;
}

const CJK_RE = /[\u4e00-\u9fa5]/g;
const WORD_RE = /[a-zA-Z]+/g;
const WPM = 300;

/** 从 markdown 文本计算写作统计：字数、阅读时间、段落数。 */
export function computeStats(content: string): WritingStats {
  const chars = content.length;
  const cjk = (content.match(CJK_RE) || []).length;
  const en = (content.match(WORD_RE) || []).length;
  const words = cjk + en;
  const readTimeMin = Math.max(1, Math.ceil(words / WPM));
  const paragraphs = content.split(/\n\n+/).filter((s) => s.trim()).length;
  return { chars, words, readTimeMin, paragraphs };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run web:test -- web/src/workspace/craft/__tests__/computeStats.test.ts`
Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/workspace/craft/computeStats.ts web/src/workspace/craft/__tests__/computeStats.test.ts
git commit -m "feat(craft): add computeStats pure function with tests"
```

---

### Task 6: TocPanel 组件 + EditorPane 集成 + 写作统计

**Files:**
- Create: `web/src/workspace/TocPanel.tsx`
- Modify: `web/src/workspace/EditorPane.tsx`
- Modify: `web/src/workspace/layout.css`

- [ ] **Step 1: 创建 TocPanel.tsx**

```tsx
// web/src/workspace/TocPanel.tsx
import { useState } from "react";
import type { TocEntry } from "./craft/extractToc.js";

interface Props {
  toc: TocEntry[];
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  content: string;
}

/** 右浮大纲：点击跳转 scrollCraftToSnippet，滚动高亮当前章节。 */
export function TocPanel({ toc, scrollContainerRef, content }: Props) {
  const [activeIdx, setActiveIdx] = useState(0);

  if (toc.length < 3) return null;

  const handleClick = (text: string) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    // 在 DOM 中查找匹配的 heading
    const headings = el.querySelectorAll("h1, h2, h3");
    headings.forEach((h) => {
      if (h.textContent?.includes(text.slice(0, 30))) {
        h.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  };

  // 简化版 active 追踪：监听 scroll 位置
  const onScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const headings = el.querySelectorAll("h1, h2, h3");
    let idx = 0;
    headings.forEach((h, i) => {
      if (h.getBoundingClientRect().top < 120) idx = i;
    });
    setActiveIdx(idx);
  };

  // 挂载 scroll listener
  if (scrollContainerRef.current && !(scrollContainerRef.current as any).__tocBound) {
    scrollContainerRef.current.addEventListener("scroll", onScroll, { passive: true });
    (scrollContainerRef.current as any).__tocBound = true;
  }

  return (
    <nav className="ws-toc-panel" data-testid="toc-panel" aria-label="大纲">
      <div className="ws-toc-title text-caption">大纲</div>
      <ul className="ws-toc-list">
        {toc.map((entry, i) => (
          <li
            key={i}
            className={`ws-toc-item ws-toc-l${entry.level}${i === activeIdx ? " active" : ""}`}
            onClick={() => handleClick(entry.text)}
          >
            {entry.text}
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 2: layout.css 追加 TOC + stats 样式**

在 layout.css 末尾追加：

```css
/* ===== TOC 大纲 ===== */
.ws-toc-panel {
  position: absolute;
  right: 16px;
  top: 72px;
  width: 200px;
  max-height: calc(100% - 100px);
  overflow-y: auto;
  z-index: 10;
  opacity: 0.8;
  transition: opacity var(--duration-normal, 180ms);
}
.ws-toc-panel:hover { opacity: 1; }
.ws-toc-title { padding: 0 0 8px; }
.ws-toc-list { list-style: none; padding: 0; margin: 0; }
.ws-toc-item {
  font-size: 12px;
  line-height: 1.5;
  padding: 4px 8px;
  cursor: pointer;
  color: var(--ink-muted);
  border-radius: 4px;
  border-left: 2px solid transparent;
  transition: all var(--duration-fast, 150ms);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ws-toc-item:hover { color: var(--ink); background: var(--bg-hover); }
.ws-toc-item.active {
  color: var(--ink);
  border-left-color: var(--accent-amber);
  font-weight: 500;
}
.ws-toc-l2 { padding-left: 20px; }
.ws-toc-l3 { padding-left: 32px; }

/* ===== 写作统计 caption ===== */
.ws-writing-stats {
  font-size: 11px;
  color: var(--ink-muted);
  letter-spacing: 0.02em;
  white-space: nowrap;
}
```

- [ ] **Step 3: EditorPane 集成 — 加 import + TOC + stats**

在 EditorPane.tsx 的 import 区追加：

```tsx
import { TocPanel } from "./TocPanel.js";
import { extractToc } from "./craft/extractToc.js";
import { computeStats } from "./craft/computeStats.js";
```

在组件内（`const markstreamDark = useMarkstreamDark();` 或 `const craftRef = useRef` 附近）追加：

```tsx
const toc = extractToc(state.draftContent);
const stats = computeStats(state.draftContent);
```

在 toolbar 的字数 span 处，替换为写作统计：

```tsx
<span className="ws-writing-stats">{stats.words} 字 · {stats.readTimeMin} 分钟 · {stats.paragraphs} 段</span>
```

在 `<CraftBody ... />` 之后、`<SourcePeek ... />` 之前插入 TOC：

```tsx
{TocPanel && (
  <TocPanel toc={toc} scrollContainerRef={craftRef} content={state.draftContent} />
)}
```

注意：删掉旧的 `<span className="muted" style={{ fontSize: 12 }}>{state.draftContent.length} 字</span>` 行。

- [ ] **Step 4: 全量测试 + 构建**

Run: `npm run web:test && npm run web:build`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/workspace/TocPanel.tsx web/src/workspace/EditorPane.tsx web/src/workspace/layout.css
git commit -m "feat(craft): integrate TOC panel and writing stats into EditorPane"
```

---

### Task 7: 集成验证

**Files:**
- Create: `web/src/workspace/__tests__/ProseIntegration.test.tsx`

- [ ] **Step 1: 写集成 smoke 测试**

```tsx
// web/src/workspace/__tests__/ProseIntegration.test.tsx
import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { describe, it, expect, vi } from "vitest";
import { WorkspaceProvider, useWorkspace } from "../WorkspaceStore.js";
import { EditorPane } from "../EditorPane.js";

vi.mock("../../api.js", () => ({ api: { updateNote: vi.fn().mockResolvedValue({ ok: true }) }, getToken: () => "x" }));
vi.mock("../../components/Toast.js", () => ({ useToast: () => () => {} }));
vi.mock("../../components/DocPreview.js", () => ({ DocPreview: () => null }));
vi.mock("../SelectionContextBar.js", () => ({ SelectionContextBar: () => null }));
vi.mock("markstream-react", () => ({ default: ({ content }: any) => <div>{content}</div> }));

function Seed() {
  const { dispatch } = useWorkspace();
  useEffect(() => {
    dispatch({
      type: "SET_ACTIVE_DOC",
      payload: {
        id: "1", title: "T",
        content: "# 标题一\n\n## 章节 A\n\n正文段落。\n\n## 章节 B\n\n另一段。",
        kind: "note",
      },
    });
  }, [dispatch]);
  return <EditorPane />;
}

describe("Prose integration", () => {
  it("PV4: shows TOC for content with 3+ headings", () => {
    render(<WorkspaceProvider><Seed /></WorkspaceProvider>);
    expect(screen.getByTestId("toc-panel")).toBeInTheDocument();
  });

  it("PO4: shows writing stats with word count", () => {
    render(<WorkspaceProvider><Seed /></WorkspaceProvider>);
    expect(screen.getByText(/字/)).toBeInTheDocument();
    expect(screen.getByText(/分钟/)).toBeInTheDocument();
    expect(screen.getByText(/段/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 全量测试 + 构建**

Run: `npm run web:test && npm run web:build`
Expected: 全部 PASS

- [ ] **Step 3: Commit**

```bash
git add web/src/workspace/__tests__/ProseIntegration.test.tsx
git commit -m "test(prose): integration test for TOC and writing stats"
```

---

## Self-Review

**Spec coverage:**
- PV1 (dark 修复) → Task 1 ✓
- PV2 (标题阶梯) → Task 1 + 2 ✓
- PV3 (代码块标签+复制) → Task 3 ✓
- PV4 (TOC) → Task 4 + 6 ✓
- PO1-PO4 → Task 2 + 6 ✓
- PB1 (scroll 高亮) → Task 6 ✓
- PB2 (复制 toast) → Task 3 ✓
- PB3 (dark 切换) → Task 1 (useMarkstreamDark) ✓

**Placeholder scan:** 无 TBD/TODO ✓

**Type consistency:** `TocEntry { level, text }` 在 extractToc + TocPanel 一致；`WritingStats` 在 computeStats + EditorPane 一致 ✓

---

## 执行方式（二选一）

**1. Subagent-Driven（推荐）** — Task 3（MutationObserver）和 Task 6（集成）较复杂，适合逐 Task review

**2. Inline Execution** — 本会话连续执行

**Which approach?**
