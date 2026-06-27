# private-kb 工作区布局完整性 — 设计规格

> 代码库：`/Users/lijixiang/ZCodeProject/private-kb`（同步部署目标：`/opt/private-kb`）  
> 前置规格：`docs/superpowers/specs/2026-06-27-kb-youmind-workspace-design.md`

## 问题陈述

用户反馈三栏工作区频繁「错位」：Chat 输入框铺满全窗、编辑器与对话栏位置互换、中栏大片空白。根因已确认：

| ID | 根因 | 技术细节 |
|----|------|----------|
| R1 | Grid 列数与 DOM 不匹配 | `grid-template-columns: 3列`，子节点 5 个（含 2 个 resizer），auto-placement 把 pane 挤到错误格子 |
| R2 | Composer 脱离 Chat 栏 | 全局 `.composer-wrap { position:absolute }` 为旧全屏 Chat 设计；`.ws-chat` 无 containment |
| R3 | CSS 双轨 | `styles.css` 遗留 `.workspace` 块与 `layout.css` 的 `.workspace-root` 并存 |
| R4 | 无 Layout 契约测试 | E2E 用 `.catch(()=>{})` 吞失败，布局回归不可检测 |

## 目标

建立**单一布局真相源 + Pane  containment 契约 + 可自动验证的 invariants**，保证三栏在任何交互（切文档、流式输出、拖拽调宽、刷新）后不再错位。

## 非目标

- 移动端三栏堆叠（仍显示 mobile-gate）
- 重写 ChatPane 业务逻辑 / SSE
- 删除 `screens/Workspace.tsx`（仅标 `@deprecated`，本 spec 不删文件）

## 架构

```text
WorkspaceShell（组合层）
  └── WorkspaceLayout（Grid 唯一 owner，5 列 + grid-template-areas）
        ├── [data-pane="left"]   FileTree
        ├── resizer-l (4px)
        ├── [data-pane="center"] EditorPane
        ├── resizer-r (4px)
        └── [data-pane="right"]  ChatPane
              ├── chat-scroll (flex:1, overflow)
              └── ws-composer-stack (flex-shrink:0)  ← 非 absolute

layout/invariants.ts — assertPaneLayout / isComposerContained
layout/invariants.test.ts — 单元测试
playwright-layout.spec.ts — 几何 + 视觉 baseline
```

## Grid 定义（锁定）

```css
grid-template-columns:
  var(--ws-left) 4px minmax(0, 1fr) 4px var(--ws-right);
grid-template-areas:
  "topbar topbar topbar topbar topbar"
  "left   resizer-l center resizer-r right";
```

## 验收标准

### 一票否决

| ID | 标准 |
|----|------|
| LV1 | 1400×900 视口：三个 `[data-pane]` 同时可见，且水平顺序为 left → center → right |
| LV2 | Chat composer 的 bounding box 100% 包含在 `[data-pane="right"]` 内 |
| LV3 | `npm run web:test` 与 `npx playwright test server/test/playwright-layout.spec.ts` 全 PASS |

### 观察性（O）

| ID | 标准 |
|----|------|
| LO1 | `.workspace-root` 为 5 列 grid，resizer 占独立列 |
| LO2 | 每个 pane 有 `data-pane="left|center|right"` |
| LO3 | Chat 区无 `.composer-wrap`（改用 `.ws-composer-stack`） |
| LO4 | `styles.css` 中 L740–867 遗留 `.workspace` 块已删除 |

### 行为性（B）

| ID | 标准 |
|----|------|
| LB1 | 拖拽左/右 resizer 后三栏仍满足 LV1/LV2 |
| LB2 | 刷新页面后 localStorage 布局恢复且 invariants PASS |
| LB3 | 长对话流式输出过程中 composer 不漂移（E2E 断言） |
| LB4 | 打开笔记 / 切换对话 / 打开设置返回后 invariants PASS |

### 数据性（D）

| ID | 标准 |
|----|------|
| LD1 | `localStorage['kb.workspace.layout']` 格式不变 |
| LD2 | `assertPaneLayout` 返回 `{ ok: boolean, errors: string[] }`，errors 可读 |

## 文件索引

| 路径 | 动作 |
|------|------|
| `web/src/workspace/layout/invariants.ts` | 新建 |
| `web/src/workspace/layout/WorkspaceLayout.tsx` | 新建（从 Shell 抽出 grid DOM） |
| `web/src/workspace/layout.css` | 改：5 列 grid + composer stack |
| `web/src/workspace/WorkspaceShell.tsx` | 改：委托 WorkspaceLayout |
| `web/src/workspace/ChatPane.tsx` | 改：composer-stack |
| `web/src/workspace/FileTree.tsx` | 改：`data-testid="file-tree"` |
| `web/src/workspace/EditorPane.tsx` | 改：`data-testid="editor-pane"` |
| `web/src/styles.css` | 删：L740–867 遗留块 |
| `web/src/workspace/__tests__/LayoutGrid.test.tsx` | 新建 |
| `web/src/workspace/__tests__/ComposerContainment.test.tsx` | 新建 |
| `web/src/workspace/layout/__tests__/invariants.test.ts` | 新建 |
| `server/test/playwright-layout.spec.ts` | 新建 |
| `server/test/playwright-workspace.spec.ts` | 改：去掉 `.catch` |
