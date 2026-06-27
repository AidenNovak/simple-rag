# meimaobing kb — 品味宪法（Taste Constitution）

> 评审 `design/explorations/` 时对照本文件。后续 React 实现与 ui-polish 的裁决依据。

## 1. 产品气质一句话

> **meimaobing kb = 暖色纸面上的私人研究台：左轻、中深、右对话；写字优先，聊天辅助。**

不是：SaaS dashboard、不是 ChatGPT 克隆、不是 Notion 数据库风。

## 2. 参考谱系（学什么 / 不抄什么）

| 参考 | 学什么 | 不抄什么 |
|------|--------|----------|
| **Bear** | 纸面留白、标题层级、编辑沉浸 | macOS 独占 UI 控件 |
| **YouMind** | 三栏上下文、参考笔记与 Craft 关系 | 整站布局像素级 |
| **Apple Notes + iMessage** | 侧栏密度、消息气泡克制、系统字体 | 蓝绿 iMessage 色 |
| **Codex / VS Code** | meta 信息收敛、mono 仅用于源码 peek | 暗色 IDE 默认皮 |

## 3. 色彩纪律（Warm Paper 上微调，非重造）

**基底不可动：**

| Token | 值 |
|-------|-----|
| `--paper-sidebar` | `#EDE6DC` |
| `--paper-craft` | `#FFFCF7` |
| `--paper-base` | `#F7F2EA` |
| `--ink` | `#1A1612` |
| `--accent-amber` | `#B45309` |

**品味旋钮（每套在 HTML 注释写取值）：**

| 旋钮 | 范围 |
|------|------|
| 对比度 | soft / medium |
| 密度 | airy / compact |
| 对话风格 | editorial / conversational |
| Accent 用量 | whisper / pulse |
| 圆角 | 8–14px |

## 4. 排版层级（共用命名）

```css
--type-brand:    15px / 600 / -0.02em
--type-section:  11px / 600 / 0.06em
--type-row:      14px / 400 / 0
--type-craft-h1: 28px / 650 / -0.02em
--type-prose:    15px / 400 / 1.75
--type-caption:  11px / 400 / 0.04em
--type-chat-user: 15px / 400 / 1.55
--type-chat-ai:   15px / 400 / 1.65
```

**禁止：** 正文 `#fff`、Craft 全局 monospace、section 标题用 emoji。

## 5. 空间与网格

- 基准 **4pt grid**；间距只用 `4/8/12/16/24`
- Craft 正文 **max-width 680–720px**，padding ≥ 32px
- 右栏 chat stream padding **14–18px**，composer 与 scroll 视觉分离（细线或 8px 留白）
- 左栏 brand 区 ≥14px 上 padding，section 间距 16px

## 6. 信息层级（降噪）

| 元素 | 默认 | 悬停/展开 |
|------|------|-----------|
| Scope / 模型 / 计数 | caption 一行 secondary | scope 可点开 |
| 工具链 / 推理 | 折叠为一行 pill「推理 · N 步」 | 点击展开 |
| 保存状态 | 字数控 caption，去掉「0 字」刺目 | saving 时 amber dot |
| Follow-up | 细边框 pill，最多 3 个 | — |

## 7. 动效性格

- 时长 **150–180ms**，曲线 `cubic-bezier(0.25, 0.1, 0.25, 1)`
- 允许：侧栏行 hover、Side Peek slide、列表 stagger 20ms
- 禁止：bounce、大面积 shadow 动画、typing 大圆点（改用三点 4px）

## 8. 反模式清单（评审一票否决）

| ID | 反模式 |
|----|--------|
| TP1 | header 超过 2 行 meta |
| TP2 | 助手气泡深色底 + 白字（light 主题） |
| TP3 | 左栏「失败」红色大块（应用 caption Badge） |
| TP4 | composer 占右栏 >40% 视觉高度 |
| TP5 | Craft 与 Chat 用同一背景色（三栏不可分） |

---

## 评审维度（各 1–5，满分 40）

1. **纸面沉浸** — Craft 是否像写作台而非表单
2. **对话克制** — Chat 是否降噪、assistant 可读
3. **侧栏秩序** — 品牌/section/行态是否 Apple 级
4. **信息层级** — meta 是否 secondary，非抢戏
5. **琥珀纪律** — accent 是否克制、有重点
6. **间距呼吸** — 4pt grid 是否一致
7. **识别度** — 是否像 meimaobing 而非 ChatGPT
8. **可迁移性** — CSS 能否直接进 web/src/theme
