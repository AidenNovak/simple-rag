# kb HTML 设计探索 — 评审结论

> 填写日期：____  评审人：____

## 五套概览

| Variant | 气质 | 旋钮速记 |
|---------|------|----------|
| **A · Bear Studio** | 写作台沉浸，助手零背景 | soft · airy · editorial · whisper · r12 |
| **B · YouMind Context** | 强调参考与 scope，琥珀点缀 | medium · medium · conversational · pulse · r10 |
| **C · Apple Calm** | iMessage 系统感，克制圆角 | soft · medium · conversational · whisper · r18 |
| **D · Codex Pro** | 紧凑 power user，mono caption | medium · compact · editorial · pulse · r8 |
| **E · Inkwell Minimal** | 极简稿纸，无琥珀二元 ink | soft · airy · editorial · whisper · r6 |

## 得分（1–5）

| 维度 | A Bear | B YouMind | C Apple | D Codex | E Inkwell |
|------|--------|-----------|---------|---------|-----------|
| 纸面沉浸 |  |  |  |  |  |
| 对话克制 |  |  |  |  |  |
| 侧栏秩序 |  |  |  |  |  |
| 信息层级 |  |  |  |  |  |
| 琥珀纪律 |  |  |  |  |  |
| 间距呼吸 |  |  |  |  |  |
| 识别度 |  |  |  |  |  |
| 可迁移性 |  |  |  |  |  |
| **合计** |  |  |  |  |  |

## 选定方案

- **主选：** Variant ___
- **理由（3 条）：**
  1.
  2.
  3.

## 组合项（可选）

- 侧栏来自：___
- Composer 来自：___
- Craft toolbar 来自：___

## Token 差异（迁入 web/src/theme）

| Token / Class | 值 | 来源 variant |
|---------------|-----|--------------|
|  |  |  |

## 一票否决检查

- [ ] TP1 header ≤ 2 行 meta
- [ ] TP2 助手非深色底白字
- [ ] TP3 左栏失败非红色大块
- [ ] TP4 composer ≤ 右栏 40% 视觉高度
- [ ] TP5 三栏背景可区分

## 下一步

- [ ] 更新 `kb-ui-polish-v2` plan Task 顺序
- [ ] 从选定 variant CSS 提取 patch 到 `web/src/workspace/layout.css`
