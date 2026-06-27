# private-kb 暖色纸面主题 — 设计规格

> 站点：`kb.meimaobing.ai` · 代码：`/Users/lijixiang/ZCodeProject/private-kb`  
> 方向：**浅色纸面优先**（YouMind / Bear 写作台），暗色可选

## 问题

当前 UI 注释为「ChatGPT 暗色克隆」：三层纯灰 `#171717/#212121/#2f2f2f`，无品牌色、边框硬切、中栏等宽字体，整体「工程师默认皮」。

## 目标

建立 **Warm Paper Design System**，默认米纸三栏，阅读区黑字 `#1A1612`，琥珀点缀；暗色保留为 `data-theme="dark"` 可切换。

## 非目标

- 重做三栏布局或 Live Craft 交互
- 自定义字体文件 CDN（仅用系统栈）
- 浅色/暗色以外第三主题
- Auth/Settings 信息架构改动

## 设计令牌（Light 默认）

| Token | 值 | 用途 |
|-------|-----|------|
| `--paper-base` | `#F7F2EA` | 右栏对话、页面底色 |
| `--paper-sidebar` | `#EDE6DC` | 左栏资料树 |
| `--paper-craft` | `#FFFCF7` | 中栏写作面（最亮） |
| `--ink` | `#1A1612` | 正文、标题 |
| `--ink-secondary` | `#5C534A` | 次要文字 |
| `--ink-muted` | `#8A8178` | 占位、hint |
| `--accent` | `#B45309` | 主按钮、链接、active |
| `--accent-bright` | `#F28C2E` | 高亮、dirty、选区 |
| `--border` | `rgba(26,22,18,0.08)` | 分隔线 |
| `--border-strong` | `rgba(26,22,18,0.14)` | 输入框描边 |
| `--shadow-soft` | `0 1px 3px rgba(26,22,18,0.06)` | 卡片、peek |
| `--radius` | `10px` | 通用圆角 |
| `--radius-pill` | `22px` | composer |

**映射到现有变量**（兼容组件不重命名）：

```css
--bg-main: var(--paper-base);
--bg-sidebar: var(--paper-sidebar);
--bg-elevated: var(--paper-craft);
--text: var(--ink);
--text-secondary: var(--ink-secondary);
--text-muted: var(--ink-muted);
--accent: var(--accent);
--accent-text: #FFFCF7;
```

## 三栏纸面分区

```text
┌─────────────────────────────────────────────────────────┐
│ Topbar  #FFFCF7  细线底边  品牌 + 主题切换 + 设置      │
├──────────┬────────────────────────────┬───────────────┤
│ 左 #EDE6DC│ 中 #FFFCF7  Craft 写作面    │ 右 #F7F2EA    │
│ 资料树    │ -serif 标题可选 / sans 正文 │ 对话 + composer│
└──────────┴────────────────────────────┴───────────────┘
```

- 中栏 Craft：`max-width 720px`，行高 1.75，**非等宽**（源码仅在 Side Peek 用 mono）
- 左栏 active 行：左侧 3px `--accent-bright` 色条 + 浅 hover
- 右栏：用户消息暖灰 pill；助手消息无边框流式；composer 白底圆角胶囊 + 琥珀发送钮

## 暗色主题

`html[data-theme="dark"]` 保留现有 ChatGPT 灰阶 token（迁移自当前 `:root`），作为可选，存 `localStorage` 键 `kb.theme`。

## 验收标准

### 一票否决

| ID | 标准 |
|----|------|
| TV1 | 新用户/清缓存后默认 **light**，非 `#212121` 灰底 |
| TV2 | 三栏背景可区分：左 `#EDE6DC`、中 `#FFFCF7`、右 `#F7F2EA` |
| TV3 | Craft/笔记正文渲染为 `#1A1612` 黑字，非 `#ececec` |
| TV4 | 切换 dark 后恢复现有暗色，刷新仍保持 |

### 观察性（O）

| ID | 标准 |
|----|------|
| TO1 | `:root` token 定义于 `web/src/theme/tokens.css` |
| TO2 | markstream 浅色覆盖在 light 下无白字-on白底 |
| TO3 | 顶栏有主题切换控件 |
| TO4 | resizer hover 用琥珀 tint 非纯蓝 |

### 行为性（B）

| ID | 标准 |
|----|------|
| TB1 | 主题切换无整页闪烁（boot 前 `applyTheme`） |
| TB2 | Settings 返回工作区后主题不变 |

### 数据性（D）

| ID | 标准 |
|----|------|
| TD1 | `localStorage['kb.theme']` ∈ `{light, dark}` |

## 文件索引

| 路径 | 动作 |
|------|------|
| `web/src/theme/tokens.css` | 新建 |
| `web/src/theme/markstream-light.css` | 新建 |
| `web/src/theme/markstream-dark.css` | 新建（从 styles.css 迁出） |
| `web/src/theme/useTheme.ts` | 新建 |
| `web/src/theme/ThemeToggle.tsx` | 新建 |
| `web/src/styles.css` | 改：删旧 :root，import theme |
| `web/src/workspace/layout.css` | 改：三栏纸面色 + 组件 |
| `web/src/main.tsx` | 改：boot applyTheme |
| `web/src/workspace/WorkspaceShell.tsx` | 改：ThemeToggle |
