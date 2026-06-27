# private-kb UI Polish v2（Design System + OSS 参考层）— 设计规格

> 站点：`kb.meimaobing.ai` · 代码：`/Users/lijixiang/ZCodeProject/private-kb`  
> 方向：**方案 A+** — token 自研 + 借鉴优秀开源库的结构与交互，**不整包迁移** Tailwind / Ant / MUI

## 问题

Warm Paper 主题与 Apple 侧栏、Context Picker 已改善纸面感，但仍有：

- Typography / spacing 散落在 `inline style` 与 magic number（`fontSize: 12`、`gap: 10`）
- 状态指示混用 emoji（`⏳` / `⚠`）与多套 `.badge` 类，视觉不统一
- `ScopeDropdown` / `ContextRefBar` 手写 portal + fixed 定位，缺 focus trap / 键盘导航
- `CommandPalette` 自研列表，缺 cmdk 式 arrow 导航与分组语义
- `Icons.tsx` 手写 SVG 与 Lucide 生态脱节，维护成本高

## 目标

建立 **Design System v2**：在现有 `tokens.css`（Warm Paper）上扩展 typography / spacing / motion / status，并引入 **小而精** 的 npm 包 + **vendored `web/src/ui/`** 层（参考 shadcn 组合方式，样式用 CSS var 而非 Tailwind）。

## 非目标

- 引入 Tailwind、shadcn CLI、Ant Design、MUI、Chakra
- 重写三栏布局、Live Craft、SSE / markstream 流式逻辑
- 替换 `markstream-react`
- Auth / Settings 信息架构大改
- 一次性删除 `Icons.tsx`（Task 内渐进迁移）

## 前置依赖

本 spec **在以下 plan 落地后执行**（避免同一文件双次大改）：

| Plan | 状态 |
|------|------|
| `2026-06-27-kb-apple-sidebar` | 应已完成 |
| `2026-06-27-kb-chat-context-picker` | 应已完成 |
| `2026-06-27-kb-warm-paper-theme` | 应已完成 |

## OSS 参考矩阵

| 开源项目 | 参考内容 | npm 安装 | kb 落点 |
|---------|---------|----------|--------|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | 组件拆分、`ui/` 目录、Radix 组合 | **不装 CLI**；按需 vendoring 源码 | `web/src/ui/*` |
| [Radix Primitives](https://github.com/radix-ui/primitives) | a11y、focus trap、portal、键盘 | `@radix-ui/react-dropdown-menu`、`@radix-ui/react-dialog` | Scope / Context / FilePeek |
| [cmdk](https://github.com/pacocoursey/cmdk) | ⌘K 面板交互 | `cmdk` | `CommandPalette` |
| [Lucide](https://github.com/lucide-icons/lucide) | 图标一致性 | `lucide-react` | 全站 icon（经 `Icons.tsx` 再导出） |
| [markstream-react](https://www.npmjs.com/package/markstream-react) | 流式 MD | 已有 | 不变 |
| Apple HIG / Bear | 纸面层级、sidebar 密度、motion | 无 | tokens + layout.css |

**明确不引：** Ant Design、MUI、Chakra、Arco、整包 Tailwind 迁移。

## 目录结构

```text
web/src/theme/
  tokens.css          ← 扩展 spacing / status / radius scale
  typography.css      ← Apple 层级 utility classes
  motion.css          ← duration、ease、keyframes

web/src/ui/
  ui.css              ← Badge / Button / Dropdown / Dialog / cmdk 纸面样式
  badge.tsx
  button.tsx
  dropdown-menu.tsx   ← Radix wrapper
  dialog.tsx          ← Radix wrapper（FilePeek / 未来 modal）
  index.ts

web/src/Icons.tsx     ← 逐步改为 lucide-react 再导出（保持 import 路径稳定）
```

## Design Tokens v2

### Typography（Apple 层级）

| Token / Class | 值 | 用途 |
|---------------|-----|------|
| `--text-caption` | `11px / 1.35 / 0.06em` | section 标题、meta |
| `--text-body` | `14px / 1.55` | 侧栏行、按钮 |
| `--text-title` | `15px / 1.3 / -0.02em` | 品牌、面板标题 |
| `--text-prose` | `15px / 1.75` | Craft 正文 |
| `.text-caption` … | 映射上述 | 替代散落 `fontSize: 12` |

字体栈保持系统栈（与 warm-paper spec 一致），不引入 CDN 字体。

### Spacing（4pt grid）

| Token | 值 |
|-------|-----|
| `--space-1` | `4px` |
| `--space-2` | `8px` |
| `--space-3` | `12px` |
| `--space-4` | `16px` |
| `--space-5` | `24px` |

utility：`.gap-2`、`.p-3` 等 **仅 workspace + ui 层** 使用，不全局污染 legacy screens。

### Radius

| Token | 值 | 用途 |
|-------|-----|------|
| `--radius-sm` | `6px` | Badge、小按钮 |
| `--radius` | `10px` | 已有，卡片 |
| `--radius-lg` | `14px` | cmdk 面板、Dialog |

### Motion

| Token | 值 |
|-------|-----|
| `--duration-fast` | `150ms` |
| `--duration-normal` | `180ms` |
| `--ease-out` | `cubic-bezier(0.25, 0.1, 0.25, 1)` |

动效：

- 侧栏列表项：mount 时 `opacity` + `translateY(4px)` 淡入（`prefers-reduced-motion: reduce` 时禁用）
- Side Peek（`SourcePeek` / `FilePeekPanel`）：`transform translateX` + `--ease-out` 180ms
- Dropdown / Dialog：Radix 自带 + `--duration-fast` 覆盖

### Status（替代 emoji）

| Variant | 前景 | 背景 | 文案示例 |
|---------|------|------|----------|
| `pending` | `#B45309` | `rgba(180,83,9,0.12)` | 处理中 |
| `ready` | `#16a34a` | `rgba(22,163,74,0.12)` | 就绪 |
| `failed` | `#DC2626` | `rgba(220,38,38,0.12)` | 失败 |

Dark 主题下沿用 `--danger` 与 amber 变体，保证对比度。

## 组件规格

### Badge（`ui/badge.tsx`）

- API：`variant: "pending" | "ready" | "failed" | "neutral"`，`children` 为文本（**禁止 emoji**）
- 用于：`FileTree` 行尾、`Documents` 列表、`Notes` 列表、`ws-save-pill` 可保留 data-status 但视觉对齐 token

### Button（`ui/button.tsx`）

- API：`variant: "ghost" | "secondary" | "icon"`，`size: "sm" | "md"`
- 首阶段仅替换侧栏 `icon-btn`、Scope「全选」等小按钮；不替换全局 `.btn` 主 CTA

### DropdownMenu（`ui/dropdown-menu.tsx`）

- 基于 Radix DropdownMenu
- 样式：纸面 `--paper-craft` 浮层、`--shadow-soft`、`--border`
- 替换：`ScopeDropdown` portal 块、`ContextRefBar` picker portal
- 行为：Esc 关闭、Tab 循环、点击外部关闭（Radix 默认）

### Dialog（`ui/dialog.tsx`）

- 基于 Radix Dialog
- 首阶段：**仅** `FilePeekPanel` 若已是 overlay 则包装；否则 Task 7 预留，不强行改 EditorPane 布局

### CommandPalette + cmdk

- 保留 ⌘K / Ctrl+K 全局监听
- 结构：`Command` → `CommandInput` → `CommandList` → `CommandItem`
- 样式：现有 `.cmdk-*` 迁到 `ui.css`，对齐 `--radius-lg` 与 typography token
- 行为：↑↓ 选择、Enter 打开、Esc 关闭

### Icons 迁移策略

1. 安装 `lucide-react`
2. `Icons.tsx` 内每个 `IconXxx` 改为 `export { Xxx as IconXxx } from "lucide-react"`（或 thin wrapper 固定 `size` / `strokeWidth: 1.75`）
3. **不**批量改 import 路径；旧代码继续 `from "../Icons.js"`

## Inline Style 收敛范围（v2 必改）

| 文件 | 改法 |
|------|------|
| `ScopeDropdown.tsx` | DropdownMenu + typography class |
| `ContextRefBar.tsx` | DropdownMenu + typography class |
| `FileTree.tsx` | Badge 替代 emoji |
| `CommandPalette.tsx` | cmdk + ui.css |
| `ChatPane.tsx` | `gap`/`fontSize` → utility class（**不改** activity 交互逻辑） |
| `WorkspaceShell.tsx` | topbar meta → `.text-caption` |

**不在 v2 改：** `Settings.tsx` 全屏、legacy `screens/Chat.tsx`（workspace 为主战场）。

## AGENTS.md 例外声明

`web/AGENTS.md` 写「无 UI 库」指 **无重型组件库**。v2 后允许：

- Radix Primitives（dropdown、dialog）
- cmdk（命令面板）
- lucide-react（图标）

禁止整包 shadcn CLI / Tailwind。新增 primitive 须写入 `web/src/ui/` 并引用 theme token。

## 验收标准

### 一票否决

| ID | 标准 |
|----|------|
| UV1 | `FileTree` / workspace 文档状态 **无 emoji**，统一 `<Badge variant=…>` |
| UV2 | `ScopeDropdown`、`ContextRefBar` 使用 Radix Dropdown，键盘可操作（Tab / Esc） |
| UV3 | `CommandPalette` 使用 `cmdk`，↑↓ + Enter 可选中第一项 |
| UV4 | `typography.css` + `motion.css` 在 `main.tsx` 引入，Warm Paper 三色不变 |
| UV5 | `npm run web:test` 与 `npm run web:build` 通过 |
| UV6 | 新增依赖仅：`lucide-react`、`cmdk`、`@radix-ui/react-dropdown-menu`、`@radix-ui/react-dialog`（± `@radix-ui/react-slot` 若 Button 需要） |

### 应该满足

| ID | 标准 |
|----|------|
| US1 | Side Peek 打开有 180ms slide-in（reduced-motion 除外） |
| US2 | workspace 内无新增硬编码 hex（除 token 定义文件） |
| US3 | Dark 主题 Badge / Dropdown 可读 |

## 与 Kimi Shell polish 对齐

| Kimi Shell | kb v2 |
|------------|-------|
| Tailwind + shadcn | CSS token + vendored `ui/` |
| Lucide | lucide-react via Icons.tsx |
| 商业级 sidebar | apple-sidebar（前置） |
| markstream final 时机 | 不变 |

交互语法一致，**不复制 Tailwind 栈**。

## 风险与回滚

- Radix portal z-index 与现有 `zIndex: 5000` 冲突 → 统一 `--z-dropdown: 5000` token
- cmdk 与现有 debounce 搜索逻辑 → 仅替换 UI 壳，保留 `api.search` 调用
- 回滚：移除 `web/src/ui/`，还原组件 import，卸载 4 个 npm 包
