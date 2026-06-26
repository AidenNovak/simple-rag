# kb 工作台升级

> 把割裂的「检索页/笔记页/聊天页」升级为 YouMind 式「笔记 + 文件编辑 + 对话」一体化三栏工作台。
> MVP 实现，本地验收通过。生产部署为独立阶段（见末尾）。

## 1. YouMind 借鉴点（5 条交互原则）

调研 YouMind（AI 创作工作台）后提炼，本升级据此设计：

1. **三栏并列工作区**：左文件树 / 中编辑器 / 右对话，**同屏可见不切换**。用户 30 秒内理解三栏职责，可折叠适配小屏。
2. **选区即上下文**（selection-to-context）：编辑器选中文字 → 浮窗提示已带入对话 → 发送时自动注入。优先级恒为：**选区 ＞ 当前文档 ＞ 全库检索**。
3. **对话 grounded in 文档**：AI 回答标注引用来源（文件名 + locator + 片段），点击跳转原文。
4. **对话内直接改文件**：在 chat 发起「修改当前笔记」指令，agent 写回文件并展示 diff，用户确认后生效。
5. **笔记与对话双向绑定**：打开笔记时对话默认以其为 primary context；保存后索引自动更新，下次可检索。

## 2. 架构

### 关键洞察：后端地基已齐，本次只补「整合层」

经审计，6 项 YouMind 交互模式所需后端能力**升级前已全部存在**：
- 笔记 CRUD（`routes/documents.ts`）
- `update_note` 工具（`tools/index.ts:167`，会更新正文 + 重新摄入）→ 对话内改文件**无需新工具**
- `conversations.scopeDocIds` + `retrieve.ts` docIds 过滤
- Citation 引用 + SSE 流式 + 多轮持久化

**真正缺的是前端整合层**。本次新增「工作台」统一屏，把 5 个割裂屏变成三栏，并打通选区/上下文/diff 闭环。

### 三栏布局

```
┌─────────────┬──────────────────────┬────────────────────┐
│ FileTree    │ NoteEditor           │ ChatView(复用)      │
│ 笔记+文件树  │ textarea+自动保存     │ 注入 contextDocId   │
│ · 新建笔记   │ · 选区→上下文        │   + selection       │
│ · 打开/删除  │ · 保存状态提示        │ · onNoteUpdated     │
│ · 上传文件   │ · diff 展示位        │   → 刷新+出 diff    │
└─────────────┴──────────────────────┴────────────────────┘
   左 248px       中 flex              右 440px
```

### 数据流

```
打开笔记 → editor.docId
选中文字 → selection（onSelect）→ 浮窗「已带入对话」
发送问题 → POST /chat/stream { question, contextDocId, selection }
        → chat.ts: loadContextNote(docId) → contextNote{ id,title,content }
        → agent.ts: 在用户问题前注入 <current_note>...<selection>...
        → ReAct 循环（不动）：若改笔记 → update_note 工具 → 落库+enqueueIngest
done 事件 → Chat.tsx 检测 toolCalls 含 update_note(note_id===contextDocId)
         → onNoteUpdated(docId) → Workspace 拉最新内容 → DiffView 展示 → 编辑器同步
保存笔记 → api.updateNote → documents.ts PATCH → status=pending + enqueueIngest → ≤60s 可检索
```

## 3. API 变更

`POST /api/chat/stream` 与 `POST /api/chat/ask` 的 body **新增两个可选字段**（向后兼容，不传时行为与升级前完全一致）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `contextDocId` | string? | 工作台当前打开的笔记 id。后端据此加载全文注入对话上下文 |
| `selection` | string? | 用户选中的片段。注入后本条提问优先针对它 |

**无新增端点、无 schema 变更、无新工具**。原有消费者（旧 Chat 屏、第三方调用）不传这两个字段即完全不受影响。

## 4. 优先级模型

上下文按以下顺序注入，天然满足「选区 > 当前文档 > 全库检索」：

| 层级 | 来源 | 机制 |
|------|------|------|
| 1（最高）| 选区文本 | `<selection>...</selection>` 紧贴问题，明确「针对此段」 |
| 2 | 当前笔记全文 | `<current_note>` 作为系统级 user 消息注入 |
| 3（兜底）| 全库 | agent 仍可调 `search_knowledge_base` 工具检索其它文档 |

## 5. 文件清单

### 后端（2 改）
| 文件 | 改动 |
|------|------|
| `server/src/rag/agent.ts` | `agentAnswer`/`agentAnswerStream` 加 `contextNote` + `selection` 参数；新增 `buildContextNoteMessage()` 在问题前注入。**不动 StreamEvent 类型/ReAct 循环/StreamingAnswerExtractor** |
| `server/src/routes/chat.ts` | `/chat/ask`、`/chat/stream` body 接收 `contextDocId`+`selection`；新增 `loadContextNote()`（强制 `WHERE user_id` 隔离） |

### 前端（5 新 + 4 改）
| 文件 | 说明 |
|------|------|
| `web/src/screens/Workspace.tsx` | **新**。统一屏编排：三栏 + 状态机（activeDoc/selection/diff/saving）+ 自动保存 + onNoteUpdated 联动 |
| `web/src/components/FileTree.tsx` | **新**。左栏：笔记/文件分组、新建/打开/删除/上传 |
| `web/src/components/NoteEditor.tsx` | **新**。中栏：标题 + textarea + 自动保存状态 + Cmd/Ctrl+S + 选区浮窗 |
| `web/src/components/DiffView.tsx` | **新**。纯前端 LCS 逐行 diff（+/- 着色，无第三方库） |
| `web/src/screens/Chat.tsx` | **改**。Props 加 `contextDocId`/`selection`/`onNoteUpdated`；fetch body 透传；done 时检测 update_note 触发回调；composer 上方加上下文提示条。**SSE 消费/150ms 节流/activities 全不动** |
| `web/src/App.tsx` | **改**。`View` 加 `workspace` 并设为默认；侧栏加「工作台」项；渲染块。旧 5 屏全部保留 |
| `web/src/Icons.tsx` | **改**。加 `IconLayout`、`IconSave` |
| `web/src/styles.css` | **改**。追加工作台布局样式（复用现有 CSS 变量暗色主题），不动现有样式 |

## 6. 验收对照

本地全链路验证（真实 DeepSeek + 智谱 embedding）：

| 项 | 标准 | 结果 |
|----|------|------|
| **A** | 工作台可打开无白屏 | ✅ vite dev + dist build 均正常 |
| **B** | 新建/编辑/保存笔记，刷新一致 | ✅ POST `/note` + PATCH + status 轮询 |
| **B** | 保存失败有提示 | ✅ SaveStatus=error + toast |
| **C** | 打开笔记提问，答基于笔记 | ✅ 实测答「根据当前笔记「量子纠缠笔记」中的内容」，准确复现独有标记句 |
| **C** | 选中段提问针对选区 | ✅ 实测答「答案就在你选中的文字里」，针对 EPR 选区 |
| **C** | 多轮历史持久化 | ✅ conversations 落库，刷新可回显 |
| **D** | 引用展示来源 | ✅ cite-chip（文件名+locator），点击 DocPreview |
| **E** | 对话改文件 + diff | ✅ 实测 agent `get_note→update_note→finish`，笔记落库变要点列表，DiffView 展示 |
| **F** | 保存后可检索 | ✅ 编辑后 status=ready，`/api/search` 搜到新内容 |
| **G** | 旧功能不破坏 | ✅ 旧 5 屏保留；typecheck/web:build/extractor(15/15) 通过 |

## 7. 30 秒演示脚本

> 本地：`localhost:5173`（需 dev server + API + worker 同时运行，见下）

1. **登录工作台** → 默认进入「工作台」屏，左侧空树，中间空态提示
2. **新建笔记** → 点「新建笔记」→ 输入标题「会议纪要」+ 正文粘贴一段会议记录 → 等 1.5s 自动保存（或 Ctrl+S）→ 左侧出现该笔记，状态变 ready
3. **打开提问**（验收 C）→ 左侧点开笔记 → 右侧 chat 问「这次会议的结论是什么？」→ 回答基于笔记内容
4. **选区提问**（验收 C）→ 编辑器选中「项目上线日期」一段 → 浮窗提示「已带入对话」→ 问「这个日期合理吗？」→ 回答针对选区
5. **对话改文件**（验收 E）→ chat 输入「把当前笔记的行动项改成带 checkbox 的列表」→ agent 调 update_note → 底部弹出 DiffView（+/- 高亮）→ 点「采纳」→ 刷新笔记，改动生效
6. **检索验证**（验收 F）→ 切到「检索」屏，搜行动项关键词 → 命中刚改的内容

## 8. 本地启动

```bash
# 1. 依赖（PG+redis）。宿主机已有可跳过；否则 docker compose up -d postgres
docker compose up -d            # 起私有 pg(5432)+redis(6379)，端口冲突见下
#    注：宿主机若已跑 pg/redis，用宿主机的即可（.env 默认走 socket）

# 2. 三个终端
npm run dev          # API :8787
npm run dev:worker   # worker（摄入）
npm run web:dev      # 前端 :5173

# 3. 打开 http://localhost:5173 → 注册 → 默认进工作台
```

**已知**：宿主机 pg 占 5432 时，`docker compose` 的 pg 容器会端口冲突。解决：用宿主机 pg（`.env` 的 `postgres:///private_kb` 走 socket），只起 redis 容器即可。

## 9. 生产部署（待执行，本次未动生产）

服务/容器（来自 Phase 0 勘察）：`private-kb-api`(:8787) + `private-kb-worker` + `private-kb-pg`(pgvector/pg16) + 宿主 redis，经 OpenResty 反代 `kb.meimaobing.ai`。

### 部署步骤（确认后再做）
1. **备份**：`docker exec private-kb-pg pg_dump -U kb private_kb > backup-$(date +%F).sql`；备份当前镜像 `docker tag private-kb-api private-kb-api:pre-workspace`
2. **构建推送**：`docker build -t private-kb-api:workspace .` → 推到服务器
3. **滚动重启**（API 先，worker 后）：
   ```bash
   docker compose -f docker-compose.prod.yml up -d api
   docker compose -f docker-compose.prod.yml up -d worker
   ```
4. **验证**：`curl -I https://kb.meimaobing.ai`（200）+ 登录进工作台
5. **回滚**：`docker tag private-kb-api:pre-workspace private-kb-api:latest && docker compose -f docker-compose.prod.yml up -d api worker`

### 回滚
镜像 tag 回退 + compose 重启，**无 schema 变更**（本次零 migration），回滚即时无数据风险。

## 10. 红线遵守（AGENTS.md）

- ✅ 未改 `StreamEvent` 类型 / SSE 三方契约
- ✅ 未新增工具（`tools` ↔ `TOOL_DEFS` 不动）
- ✅ 未碰 `ENC_KEY`
- ✅ DB 查询全带 `user_id`（`loadContextNote` 用 `and(eq(id), eq(userId))`）
- ✅ 未改 `normalizeMath`
- ✅ 150ms 节流保留
- ✅ 零 migration（schema 不变）

## 11. 约束说明

- MVP 编辑器用 textarea（未引 CodeMirror/Monaco），满足任务「简易 textarea 可」要求
- 自动保存防抖 1.5s，仅对已存在笔记生效；新建笔记首次需手动保存生成 id
- 文件类（kind=file）编辑器只读（不破坏原件解析链路）
- 对话改文件依赖 agent 主动调 `update_note` 工具（已系统提示）；极少数情况下模型可能直接回答不调工具，属正常 LLM 行为
