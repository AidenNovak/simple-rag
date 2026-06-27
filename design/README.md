# kb 设计探索

## 预览

```bash
cd design/explorations && npx --yes serve -p 5199 .
# 打开 http://localhost:5199/index.html
```

或在仓库根 `npm run design:preview`。

## 评审流程

1. 读 `design/taste-constitution.md`
2. 打开 `design/explorations/index.html` 对比 A / B / C / D / E
3. 每套按 8 维度打分，填 `design/DECISION.md`
4. 选定 1 套 + 可选「A 的侧栏 + B 的 context bar」组合

## 品味旋钮

每套 variant HTML 顶部注释列出 5 个旋钮取值（对比度 / 密度 / 对话风格 / Accent / 圆角）。

## 禁止

- 评审时改 fixtures 文案（只评视觉）
- 引入 Google Fonts CDN（保持系统栈）
- 正文用 `#fff` / 白字（light 主题）

## 测试

```bash
npm run design:test   # 静态结构 smoke（node:test）
```

## Agent 验收 Prompt

对照 `design/taste-constitution.md` 打开五套 HTML，填 `DECISION.md`。
检查 TP1–TP5。截图保存到 `design/explorations/screenshots/`（可选）。
