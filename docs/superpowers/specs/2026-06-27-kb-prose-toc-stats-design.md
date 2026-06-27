# private-kb Markdown 精致排版 + TOC + 写作统计 — 设计规格

> 站点：`kb.meimaobing.ai` · 代码：`/Users/lijixiang/ZCodeProject/private-kb`
> 方案：A（CSS-first 排版 + 纯前端 TOC/统计），分两批的第一批

## 问题

1. **CraftBody 的 `dark` 写死**：`CraftBody.tsx:36` 硬编码 `<MarkdownRender dark />`，浅色纸面下中栏正文仍按暗色渲染
2. **Markdown 排版平庸**：`markstream-light.css` 只有颜色覆盖，无字号阶梯/段落节奏/列表样式/表格美化/代码块增强
3. **长文笔记无导航**：没有大纲目录，长笔记只能滚动找标题
4. **缺写作反馈**：只有「N 字」裸数字，无阅读时间估算

## 目标

第一批（本 spec）：
- Bear/Notion 式精致 Markdown 排版（标题衬线、列表自定义、代码块语言标签+复制、引用分层、表格斑马纹）
- 修复 CraftBody 主题 bug
- 中栏 TOC 大纲（从 h1/h2/h3 提取，点击跳转+高亮）
- 写作统计（字数 + 阅读时间 + 段落数，toolbar caption 展示）

第二批（后续 spec）：
- 标签与收藏（需后端 schema）
- 双向链接（需后端 schema）

## 非目标

- 不换 markstream-react（保留 SSE 逐 token 流式）
- 不引 react-markdown / rehype
- 不做富文本编辑器
- 不改后端 API / schema
- 不做 dark 主题排版（仅 light；dark 沿用现有）

## 架构

```
web/src/theme/
  prose.css          ← Bear/Notion 排版（标题/列表/代码/引用/表格），light + dark 分离

web/src/workspace/craft/
  CraftBody.tsx      ← 修 dark bug + 注入代码块复制按钮 + 暴露 heading refs
  extractToc.ts      ← 纯函数：从 markdown 提取 {level, text, id}[]
  CodeBlockEnhancer  ← MutationObserver 给 pre 加语言标签 + 复制按钮

web/src/workspace/
  TocPanel.tsx       ← 右浮大纲，点击 scrollCraftToSnippet，IntersectionObserver 高亮当前
  WritingStats.tsx   ← 纯函数 stats(content) + caption 组件
  EditorPane.tsx     ← 集成 TocPanel + WritingStats
  layout.css         ← TOC + stats 样式
```

## 排版规格（prose.css）

### 标题层级

| 元素 | light | 说明 |
|------|-------|------|
| h1 | 28px / 650 / serif / -0.02em / mb 16px | 文章标题，衬线（Songti/Georgia） |
| h2 | 22px / 600 / sans / mt 28px mb 12px | 章节 |
| h3 | 18px / 600 / sans / mt 20px mb 8px | 小节 |
| h4-h6 | 15px / 600 / sans | 与正文同级，仅加粗 |

### 正文

| 元素 | 规则 |
|------|------|
| p | 15px / 1.75 / mb 16px / ink |
| strong | 650 weight，ink |
| em | ink-secondary，斜体 |
| a | accent-amber，下划线 offset 2px |
| hr | border-top 1px border，my 32px |

### 列表

| 元素 | 规则 |
|------|------|
| ul | disc 自定义：`::marker color accent-bright`；pl 24px；mb 16px |
| ol | decimal；pl 24px；mb 16px |
| li | mb 6px；line-height 1.7 |
| li > ul/ol | mt 6px |

### 代码

| 元素 | 规则 |
|------|------|
| inline code | mono 13px；bg rgba(26,22,18,0.06)；radius 4px；padding 2px 6px |
| pre | bg rgba(26,22,18,0.04)；border 1px border；radius 10px；padding 16px；overflow-x auto；mb 16px；position relative |
| pre code | mono 13px / 1.6；ink |
| pre[data-lang]::before | 语言标签：absolute top-right；caption 10px；ink-muted；content attr(data-lang) |
| pre .copy-btn | absolute top-right；opacity 0 hover 显示；点击复制 code textContent |

### 引用

| 元素 | 规则 |
|------|------|
| blockquote | border-left 3px accent-bright；pl 16px；ml 0；color ink-secondary；bg rgba(242,140,46,0.06)；radius 0 8px 8px 0；padding 12px 16px；mb 16px |
| blockquote p:last-child | mb 0 |

### 表格

| 元素 | 规则 |
|------|------|
| table | width 100%；border-collapse；mb 16px；font-size 14px |
| th | text-align left；bg rgba(26,22,18,0.04)；font-weight 600；padding 8px 12px；border-bottom 2px border-strong |
| td | padding 8px 12px；border-bottom 1px border |
| tr:nth-child(even) td | bg rgba(26,22,18,0.02) |
| table wrapper | overflow-x auto（长表格横向滚动） |

## TOC 规格

- **提取**：`extractToc(markdown)` 正则匹配 `^(#{1,3})\s+(.+)$`，返回 `{ level, text }[]`
- **位置**：中栏右浮（`position: absolute; right: 16px; top: 72px; width: 200px`），仅 ≥3 个 heading 时显示
- **交互**：点击 → `scrollCraftToSnippet(container, content, heading.text)`；IntersectionObserver 高亮当前可见 heading
- **样式**：caption 字号；h1 无缩进，h2 pl 12px，h3 pl 24px；active 项 amber 左条

## 写作统计

- `computeStats(content)` 纯函数：`{ chars, words, readTimeMin, paragraphs }`
  - chars：`content.length`
  - words：CJK 字符数 + 英文单词数（`/[\u4e00-\u9fa5]/g` + `/[a-zA-Z]+/g`）
  - readTimeMin：`Math.max(1, Math.ceil(words / 300))`（中文 300 字/分）
  - paragraphs：`content.split(/\n\n+/).filter(s => s.trim()).length`
- **展示**：toolbar 内 `{words} 字 · {readTimeMin} 分钟 · {paragraphs} 段`，caption 样式

## 验收标准

### 一票否决

| ID | 标准 |
|----|------|
| PV1 | light 主题下中栏 Craft 正文为深色 `#1A1612`（非暗色渲染） |
| PV2 | h1 衬线、h2/h3 有清晰字号阶梯，段落间距舒适 |
| PV3 | 代码块右上角显示语言标签 + hover 复制按钮 |
| PV4 | ≥3 标题时中栏右侧出现 TOC，点击可跳转 |

### 观察性

| ID | 标准 |
|----|------|
| PO1 | 引用块有左侧琥珀条 + 浅底 |
| PO2 | 表格有斑马纹 + 表头加粗 |
| PO3 | 列表 marker 为琥珀色 |
| PO4 | toolbar 显示字数 + 阅读时间 + 段落数 |

### 行为性

| ID | 标准 |
|----|------|
| PB1 | 滚动时 TOC 高亮当前章节 |
| PB2 | 代码块复制按钮点击后 toast「已复制」 |
| PB3 | 切换 dark 主题时排版色跟随（dark 沿用现有 markstream-dark） |

## 文件索引

| 路径 | 动作 |
|------|------|
| `web/src/theme/prose.css` | 新建 |
| `web/src/workspace/craft/CraftBody.tsx` | 改：修 dark + enhancer |
| `web/src/workspace/craft/extractToc.ts` | 新建 |
| `web/src/workspace/craft/computeStats.ts` | 新建 |
| `web/src/workspace/TocPanel.tsx` | 新建 |
| `web/src/workspace/EditorPane.tsx` | 改：集成 TOC + stats |
| `web/src/main.tsx` | 改：import prose.css |
| `web/src/workspace/layout.css` | 改：TOC + stats 样式 |
