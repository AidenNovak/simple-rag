/**
 * Agent 问答循环（工具调用 + RAG）
 *
 * 流程：
 *   1. 系统提示 + 历史 + 用户问题 → DeepSeek（带 tools 定义）
 *   2. 若返回 tool_calls → 执行工具 → 把结果作为 tool message 喂回 → 回到 1
 *   3. 若返回最终答案 → 结束
 *
 * 最多迭代 config.tuning.agentMaxIters 轮，防止工具调用死循环。
 * 收集所有工具调用与检索结果，作为 citations 返回前端。
 */
import { makeChatClient, resolveChatApiKey, resolveChatModel, resolveChatBaseUrl, type UserChatCreds } from "../llm/client.js";
import { executeTool, getToolDefs, type ToolContext } from "../tools/index.js";
import { buildContextMessages, estimateMessagesTokens, shouldCompress, downgradeToolResult, getInputBudget, type HistoryTurn } from "../llm/context.js";
import { compressHistory } from "../llm/compress.js";
import { sanitizeLLMOutput, hasLeakedToolCalls } from "../llm/sanitize.js";
import { logger } from "../config/logger.js";
import { config } from "../config/index.js";
import { getDb, schema } from "../db/client.js";
import { and, eq } from "drizzle-orm";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";

/** 引用来源（前端展示用）。 */
export interface Citation {
  n: number;
  chunkId: string;
  docId: string;
  docTitle: string;
  locator: Record<string, string | number> | null;
  snippet: string;
}

const SYSTEM_PROMPT = `你是一个私人知识库助手。你拥有以下工具来访问和管理用户的知识库。

## 自主性与持续性（核心规则）
你必须持续推进，直到用户的任务完全解决。不要在仅做了一次检索后就急于回答。
如果一次检索不能覆盖问题的全部方面，用不同关键词再次检索，直到你确信已充分理解文档内容。
即使检索结果看起来部分相关，也要继续探索是否有遗漏的内容。
**绝不在证据不足时猜测或编造答案。**

## 终止规则（重要）
当你完成所有必要的检索，准备好给出最终答案时，**必须调用 finish 工具**，并将你的完整回答作为 answer 参数传入。
不要直接输出文字作为回答——只有通过 finish 工具的 answer 参数给出的内容才会被用户看到。
注意：工具调用次数上限为 10 次，请合理规划，不要浪费在重复检索同一内容上。

## 回答规则
1. 如果问题涉及时间敏感性（最新事件、实时数据、日期计算），先调用 get_time 获取当前时间。
2. 用户的问题如果涉及知识库内容，必须先调用 search_knowledge_base 工具检索。
3. 对于复杂或多方面的问题，分多次检索不同方面的内容（例如：先检索"原理"，再检索"数据"，再检索"结论"）。
4. 回答时在句末用 [n] 角标标注来源。
5. 如果检索结果不足，诚实说明"知识库中未找到相关内容"。
6. 用户让你"记录/记下/备忘"某内容时，调用 create_note 工具。
7. 用户问文档状态/列表时，调用对应工具。
8. **网络搜索**：当知识库中没有相关内容，或用户问最新事件、实时数据、新闻时，调用 web_search 搜索互联网。搜索结果也可以作为引用来源。如果搜索结果中有需要深入了解的页面，用 web_scrape 抓取完整内容。
9. 用中文回答，条理清晰；公式用 LaTeX，代码用代码块。
10. 不要复述工具返回的原文，理解后组织语言。`;

export interface AgentResult {
  answer: string;
  citations: Citation[];
  toolCalls: ToolTrace[];
  usage: unknown;
}

export interface ToolTrace {
  name: string;
  args: unknown;
  resultPreview: string;
  /** 完整结果（前端可展开查看） */
  resultFull?: string;
  /** 笔记内容（仅 create_note 工具，前端渲染展示） */
  noteContent?: string;
  noteTitle?: string;
  noteDocId?: string;
  /** 活动类型：tool=知识库/笔记等，search=网络搜索/抓取。前端时间轴据此着色 */
  type?: "tool" | "search";
}

/** 判断工具是否属于网络搜索类（web_search / web_scrape）。 */
const isWebTool = (name: string) => name === "web_search" || name === "web_scrape";

/** 生成后续建议问题（用于 follow-up chips）。 */
export async function generateFollowUps(question: string, answer: string, creds: UserChatCreds): Promise<string[]> {
  try {
    const { apiKey } = resolveChatApiKey(creds);
    if (!apiKey) return [];
    const baseUrl = resolveChatBaseUrl(creds);
    const client = makeChatClient(apiKey, baseUrl);
    const resp = await client.chat.completions.create({
      model: "deepseek-v4-flash",
      messages: [
        { role: "system", content: "根据以下问答，生成 3 个用户可能想问的后续问题。每行一个，不要编号，不要标点。直接输出问题。" },
        { role: "user", content: `问题：${question.slice(0, 200)}\n回答：${answer.slice(0, 300)}` },
      ],
      max_tokens: 200,
      temperature: 0.5,
    });
    const text = resp.choices[0]?.message?.content || "";
    return text.split("\n").map((s) => s.trim()).filter((s) => s.length > 2 && s.length < 60).slice(0, 3);
  } catch {
    return [];
  }
}

/** 用 flash 模型生成对话标题。 */
export async function generateTitle(question: string, answer: string, creds: UserChatCreds): Promise<string | null> {
  try {
    const { apiKey } = resolveChatApiKey(creds);
    if (!apiKey) return null;
    const baseUrl = resolveChatBaseUrl(creds); const client = makeChatClient(apiKey, baseUrl);
    const resp = await client.chat.completions.create({
      model: "deepseek-v4-flash",
      messages: [
        { role: "system", content: "根据以下问答生成一个 4-12 字的中文对话标题，不要标点，直接输出标题。" },
        { role: "user", content: `问题：${question.slice(0, 200)}\n回答：${answer.slice(0, 200)}` },
      ],
      max_tokens: 800, // reasoning 模型需要足够空间思考后输出
      temperature: 0.1,
    });
    const title = resp.choices[0]?.message?.content?.trim() || null;
    logger.debug({ title, finishReason: resp.choices[0]?.finish_reason }, "title generated");
    return title && title.length <= 30 ? title : null;
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "title generation failed");
    return null;
  }
}

/** 当前打开的笔记上下文（工作台注入，agent 回答优先基于它）。 */
export interface ContextNote {
  id: string;
  title: string;
  content: string;
}

/** 选区形状（与前端 Selection 一致；D2 数据契约）。 */
export interface SelectionContext {
  docId: string;
  text: string;
  start?: number;
  end?: number;
}

/** 构造选区注入块（独立导出，供单测验证）。 */
export function buildSelectionContext(sel: SelectionContext, docTitle: string): string {
  return [
    "## 用户当前选区（优先回答此片段）",
    `文档：《${docTitle}》`,
    "```",
    sel.text,
    "```",
  ].join("\n");
}

/** 把 contextNote + selection 构造为一条注入消息（拼在问题之前，优先级：选区 > 当前笔记 > 全库检索）。 */
function buildContextNoteMessage(note: ContextNote, selection?: string): string {
  const head = `<current_note id="${note.id}" title="${note.title}">\n${note.content}\n</current_note>\n用户当前正在编辑此笔记。当用户提到"当前笔记/本文档/这个文件"时即指它。如需修改它，调用 update_note 工具，note_id 为 ${note.id}。`;
  const tail = selection
    ? `\n\n<selection>\n${selection}\n</selection>\n用户选中了上述片段，本条提问针对它。`
    : "";
  return head + tail;
}

export async function agentAnswer(
  userId: string,
  question: string,
  creds: UserChatCreds,
  history: { role: "user" | "assistant"; content: string }[] = [],
  docIds?: string[] | null,
  enableWebSearch?: boolean,
  contextNote?: ContextNote,
  selection?: string
): Promise<AgentResult> {
  const { apiKey } = resolveChatApiKey(creds);
  if (!apiKey) throw new Error("[agent] no API key resolved (set CHAT_API_KEY or bind user key)");
  const model = resolveChatModel(creds);
  const baseUrl = resolveChatBaseUrl(creds); const client = makeChatClient(apiKey, baseUrl);
  const ctx: ToolContext = { userId, creds, docIds };
  const toolDefs = getToolDefs({ webSearch: enableWebSearch });

  // 用 token 预算构建上下文（替代旧的 history.slice(-6)）
  const turns: HistoryTurn[] = history.map((h) => ({ role: h.role, content: h.content }));
  const ctxBuilt = buildContextMessages(SYSTEM_PROMPT, turns, question, model);
  let messages = ctxBuilt.messages;
  // 工作台注入：当前笔记全文 + 选区（若提供），插在用户问题之前（问题必为 messages 末尾）
  if (contextNote) {
    const inject = buildContextNoteMessage(contextNote, selection);
    const lastIdx = messages.length - 1;
    messages = [...messages.slice(0, lastIdx), { role: "user", content: inject }, messages[lastIdx]];
  }
  logger.info({ userId, model, historyTurns: history.length, contextTokens: ctxBuilt.tokensUsed, compressed: ctxBuilt.compressed }, "agent start");

  const toolCalls: ToolTrace[] = [];
  let webSearchCount = 0; // 每轮对话网络搜索调用计数（web_search + web_scrape）
  const citations: Citation[] = [];
  let lastUsage: unknown = null;

  for (let iter = 0; iter < config.tuning.agentMaxIters; iter++) {
    let resp;
    try {
      resp = await client.chat.completions.create({
        model,
        messages,
        tools: toolDefs,
        tool_choice: "auto",
        temperature: 0.3,
        max_tokens: config.tuning.agentMaxTokens,
      });
    } catch (e) {
      const err = e as any;
      const body = err?.error || err?.response?.body || err?.message;
      logger.error({ userId, iter, err: body }, "agent LLM call failed");
      throw new Error(`[agent] DeepSeek 调用失败 (iter ${iter}): ${JSON.stringify(body).slice(0, 400)}`);
    }

    const choice = resp.choices[0];
    lastUsage = (resp as any).usage || lastUsage;
    const msg = choice.message;

    // 模型没有调用任何工具（想直接回答）
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      // 模型直接输出了文字（没调 finish）——如果内容足够长，直接用它作为答案
      const content = sanitizeLLMOutput(msg.content || "");
      if (content && content.length > 20) {
        // 模型写了实质内容，接受为最终答案
        logger.info({ userId, iter, finishReason: "text_answer", toolCalls: toolCalls.length, contentLen: content.length }, "agent done (text answer)");
        return { answer: content, citations, toolCalls, usage: lastUsage };
      }
      // 内容太短或为空，nudge 模型
      if (iter >= config.tuning.agentMaxIters - 1) {
        // 最后一轮还是没内容：用 nudge 前累积的已有内容
        logger.info({ userId, iter, finishReason: "max_iters" }, "agent done (max iters, empty)");
        return { answer: "抱歉，我未能获取到足够的信息来回答这个问题。请尝试换一种方式提问，或上传相关文档到知识库。", citations, toolCalls, usage: lastUsage };
      }
      const nearLimit = iter >= config.tuning.agentMaxIters - 3;
      logger.info({ userId, iter, nearLimit }, "agent nudged");
      messages.push({ role: "assistant", content: msg.content || "" });
      messages.push({ role: "user", content: nearLimit
        ? "你已接近工具调用上限。请立即调用 finish 工具，基于已检索的信息给出最终回答。不要再调用其他工具。"
        : "请不要直接回答。如果你已经充分检索了知识库，请调用 finish 工具并传入你的最终回答。如果你还需要更多信息，请继续调用检索工具。" });
      continue;
    }

    // 有 tool_calls → 记录调用了哪些工具
    logger.info({ userId, iter, tools: msg.tool_calls.map((tc: any) => tc.function.name) }, "agent tool calls");

    // 把 assistant 的 tool_calls 消息加入历史
    messages.push({
      role: "assistant",
      content: msg.content || "",
      tool_calls: msg.tool_calls as any,
    });

    // 执行每个工具调用
    for (const call of msg.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        args = {};
      }
      try {
        // 网络搜索次数限制：超过上限则拒绝执行，提示模型用已有信息收尾
        if (isWebTool(call.function.name) && webSearchCount >= config.tuning.maxWebSearchPerTurn) {
          const limitMsg = `已达到网络搜索次数上限（${config.tuning.maxWebSearchPerTurn}次），请基于已检索到的信息调用 finish 工具回答，不要再调用网络搜索工具。`;
          messages.push({ role: "tool", tool_call_id: call.id, content: limitMsg } as ChatCompletionMessageParam);
          continue;
        }

        const result = await executeTool(call.function.name, args, ctx);

        // finish 工具：模型主动终止，提取最终答案（agentAnswer 非流式）
        if (call.function.name === "finish") {
          const answer = sanitizeLLMOutput(result.content || "");
          logger.info({ userId, iter, finishReason: "finish_tool", toolCalls: toolCalls.length + 1, citations: citations.length }, "agent done (finish)");
          toolCalls.push({ name: "finish", args, resultPreview: "最终答案", type: "tool" });
          return { answer, citations, toolCalls, usage: lastUsage };
        }

        if (isWebTool(call.function.name)) webSearchCount++;
        const toolData = result.data as any;
        toolCalls.push({
          name: call.function.name, args, resultPreview: result.content.slice(0, 120),
          resultFull: result.content.slice(0, 1500),
          noteContent: toolData?.noteContent,
          noteTitle: toolData?.title,
          noteDocId: toolData?.documentId,
          type: isWebTool(call.function.name) ? "search" : "tool",
        });

        // 从检索结果提取 citations（按 docId 去重，同一文档只一个引用）
        const data = result.data as any;
        if (data?.chunks && Array.isArray(data.chunks)) {
          data.chunks.forEach((c: any) => {
            const docId = c.docId || "";
            // 跳过已引用过的文档
            if (docId && citations.some((ex) => ex.docId === docId)) return;
            citations.push({
              n: citations.length + 1,
              chunkId: c.chunkId || "",
              docId,
              docTitle: c.docTitle || "",
              locator: c.locator || null,
              snippet: c.text || c.snippet || "",
            });
          });
        }

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: result.content,
        } as ChatCompletionMessageParam);
      } catch (e) {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: `工具执行失败：${(e as Error).message}`,
        } as ChatCompletionMessageParam);
      }
    }

    // 工具循环内预算检查（Codex 模式）：超阈值时先降级旧 tool 结果，再触发压缩
    const totalTokens = estimateMessagesTokens(messages.map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : "" })));
    if (shouldCompress(totalTokens, model)) {
      // 第 1 步：降级旧 tool 结果为 stub
      messages = messages.map(downgradeToolResult);
      // 第 2 步：仍超阈值 → LLM 压缩旧对话
      const afterDowngrade = estimateMessagesTokens(messages.map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : "" })));
      if (shouldCompress(afterDowngrade, model)) {
        logger.info({ tokens: afterDowngrade, budget: getInputBudget(model) }, "triggering context compression");
        const compressed = await compressHistory(messages, config.tuning.compressRecentKeep, client, model);
        messages = compressed.messages;
      }
    }
  }

  // 超过最大迭代：用已有信息收尾（不报错）
  return {
    answer: "抱歉，我未能获取到足够的信息来完整回答这个问题。请尝试换一种方式提问，或上传相关文档到知识库。",
    citations,
    toolCalls,
    usage: lastUsage,
  };
}

// ---- 流式 variant ----

/** 流式事件：前端据此渲染。 */
export type StreamEvent =
  | { type: "delta"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "citations"; citations: Citation[] }
  | { type: "toolCalls"; toolCalls: ToolTrace[] }
  | { type: "done"; answer: string; citations: Citation[]; toolCalls: ToolTrace[]; usage: unknown }
  | { type: "error"; message: string }
  | { type: "doc_patch"; docId: string; title?: string; content: string; previousContent: string };

/**
 * 从流式 JSON 片段中增量提取 `{"answer":"..."}` 的 answer 字符串值。
 *
 * 模型流式输出 finish 工具的 arguments 时，`function.arguments` 是 JSON 字符串片段，
 * 如 `{"an` → `swer":"` → `你好\n世界` → `"}`。本提取器按字符流式解析，
 * 越过 `"answer":` 前缀后逐字符解码字符串 value（处理 \" \\ \/ \b \f \n \r \t \uXXXX 转义），
 * 遇到未转义的 `"` 闭合即结束。容错：即使片段边界切断转义序列也能正确处理。
 */
export class StreamingAnswerExtractor {
  private buf = "";
  private pos = 0; // 已消费到 buf 的位置
  /** 状态机：
   *  "seek"       — 寻找 "answer" key
   *  "afterKey"   — 已匹配 "answer"，等待 : 和开头的 "
   *  "inValue"    — 在 answer 字符串 value 内，逐字符解码
   *  "inEscape"   — 遇到 \，等待下一个字符
   *  "inUnicode"  — 遇到 \u，累积 4 位 hex
   *  "done"       — answer value 闭合，不再产出 */
  private state: "seek" | "afterKey" | "inValue" | "inEscape" | "inUnicode" | "done" = "seek";
  private unicodeBuf = "";
  private out = ""; // 已解出的完整文本（用于最终校验）
  // seek 阶段：滑窗累积原始片段，用于匹配 "answer" 前缀
  private seekBuf = "";

  /** 喂入一个 arguments 片段，返回**新增**的可输出文本。 */
  feed(chunk: string): string {
    if (this.state === "done") return "";
    this.buf += chunk;
    let emitted = "";
    // 循环消费 buf 中尚未处理的字符
    while (this.pos < this.buf.length) {
      const ch = this.buf[this.pos];

      if (this.state === "seek") {
        // 累积原始字符，滑窗匹配 "answer"
        this.seekBuf += ch;
        this.pos++;
        if (this.seekBuf.endsWith('"answer"')) {
          // 已匹配 key，进入 afterKey 等待 : 与起始 "
          this.state = "afterKey";
          this.seekBuf = "";
        }
        continue;
      }

      if (this.state === "afterKey") {
        // 跳过 : 与空白，期待起始 "
        if (ch === ":" || ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
          this.pos++;
          continue;
        }
        if (ch === '"') {
          this.pos++;
          this.state = "inValue";
          continue;
        }
        // value 不是字符串（如数字），放弃提取
        this.state = "done";
        continue;
      }

      if (this.state === "inValue") {
        if (ch === '"') {
          // 未转义的 " → value 闭合
          this.pos++;
          this.state = "done";
          break;
        } else if (ch === "\\") {
          this.pos++;
          this.state = "inEscape";
          continue;
        } else {
          emitted += ch;
          this.out += ch;
          this.pos++;
          continue;
        }
      }

      if (this.state === "inEscape") {
        let decoded: string;
        switch (ch) {
          case '"': decoded = '"'; break;
          case "\\": decoded = "\\"; break;
          case "/": decoded = "/"; break;
          case "b": decoded = "\b"; break;
          case "f": decoded = "\f"; break;
          case "n": decoded = "\n"; break;
          case "r": decoded = "\r"; break;
          case "t": decoded = "\t"; break;
          case "u":
            this.pos++;
            this.state = "inUnicode";
            this.unicodeBuf = "";
            continue;
          default:
            // 未知转义：原样保留反斜杠+字符
            decoded = "\\" + ch;
        }
        emitted += decoded;
        this.out += decoded;
        this.pos++;
        this.state = "inValue";
        continue;
      }

      if (this.state === "inUnicode") {
        this.unicodeBuf += ch;
        this.pos++;
        if (this.unicodeBuf.length === 4) {
          const code = parseInt(this.unicodeBuf, 16);
          const decoded = String.fromCodePoint(code);
          emitted += decoded;
          this.out += decoded;
          this.state = "inValue";
        }
        continue;
      }

      // done：不应到达
      break;
    }
    return emitted;
  }

  /** 已解出的完整文本（用于 done 事件校验）。 */
  get text(): string {
    return this.out;
  }
}

/**
 * 流式 Agent 问答。
 *
 * 策略：每一轮 LLM 调用都用 stream:true 真流式消费。
 *   - reasoning_content 增量推送（DeepSeek 思考过程逐字显示）
 *   - 工具调用按 index 累积 arguments 片段，流结束后统一执行（工具结果一次性返回合理）
 *   - finish 工具的 answer 用 StreamingAnswerExtractor 增量解出，边生成边 yield delta（真流式）
 *
 * 事件顺序：reasoning×N → toolCalls → citations → delta×N → done
 */
export async function* agentAnswerStream(
  userId: string,
  question: string,
  creds: UserChatCreds,
  history: { role: "user" | "assistant"; content: string }[] = [],
  docIds?: string[] | null,
  enableWebSearch?: boolean,
  contextNote?: ContextNote,
  selection?: string
): AsyncGenerator<StreamEvent, void, unknown> {
  const { apiKey } = resolveChatApiKey(creds);
  if (!apiKey) { yield { type: "error", message: "no API key resolved" }; return; }
  const model = resolveChatModel(creds);
  const baseUrl = resolveChatBaseUrl(creds); const client = makeChatClient(apiKey, baseUrl);
  const ctx: ToolContext = { userId, creds, docIds };
  const toolDefs = getToolDefs({ webSearch: enableWebSearch });

  // 用 token 预算构建上下文（替代旧的 history.slice(-6)）
  const turns: HistoryTurn[] = history.map((h) => ({ role: h.role, content: h.content }));
  const ctxBuilt = buildContextMessages(SYSTEM_PROMPT, turns, question, model);
  let messages = ctxBuilt.messages;
  // 工作台注入：当前笔记全文 + 选区（若提供），插在用户问题之前（问题必为 messages 末尾）
  if (contextNote) {
    const inject = buildContextNoteMessage(contextNote, selection);
    const lastIdx = messages.length - 1;
    messages = [...messages.slice(0, lastIdx), { role: "user", content: inject }, messages[lastIdx]];
  }
  logger.info({ userId, model, historyTurns: history.length, contextTokens: ctxBuilt.tokensUsed, compressed: ctxBuilt.compressed }, "stream agent start");

  const toolCalls: ToolTrace[] = [];
  const citations: Citation[] = [];
  let lastUsage: unknown = null;
  let webSearchCount = 0; // 每轮对话网络搜索调用计数（web_search + web_scrape）

  for (let iter = 0; iter < config.tuning.agentMaxIters; iter++) {
    // 真流式：stream:true，逐 token 消费 delta
    // - reasoning_content 增量推送（DeepSeek 扩展）
    // - tool_calls 按 index 累积 id/name/arguments 片段
    // - 若检测到 finish 工具，用 StreamingAnswerExtractor 增量解出 answer 并逐段 yield delta
    let stream: any;
    try {
      stream = await client.chat.completions.create({
        model,
        messages,
        tools: toolDefs,
        tool_choice: "auto",
        temperature: 0.3,
        max_tokens: config.tuning.agentMaxTokens,
        stream: true,
        stream_options: { include_usage: true },
      });
    } catch (e) {
      const err = e as any;
      const body = err?.error || err?.response?.body || err?.message;
      yield { type: "error", message: `DeepSeek 调用失败 (iter ${iter}): ${JSON.stringify(body).slice(0, 300)}` };
      return;
    }

    // 每个工具调用的累积缓冲（按 delta.tool_calls[].index 索引）
    const toolBufs = new Map<number, { id?: string; name?: string; args: string }>();
    let answerExtractor: StreamingAnswerExtractor | null = null; // finish 工具启用
    let finishIdx: number | null = null; // finish 工具的 index
    let contentAcc = ""; // delta.content 累积（text answer 路径）
    let finishReason: string | null = null;

    for await (const chunk of stream as AsyncIterable<any>) {
      if ((chunk as any).usage) lastUsage = (chunk as any).usage;
      const choice = chunk.choices?.[0];
      if (!choice) continue; // 最后一个 usage chunk 可能无 choices
      const delta = choice.delta || {};
      if (choice.finish_reason) finishReason = choice.finish_reason;

      // 1) reasoning_content 增量推送（DeepSeek 扩展字段）
      const reasoning = (delta as any).reasoning_content;
      if (reasoning) yield { type: "reasoning", content: reasoning };

      // 2) delta.content 累积（模型直接输出文字的场景）
      if (delta.content) contentAcc += delta.content;

      // 3) delta.tool_calls 累积
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx: number = tc.index ?? 0;
          let buf = toolBufs.get(idx);
          if (!buf) { buf = { args: "" }; toolBufs.set(idx, buf); }
          if (tc.id) buf.id = tc.id;
          if (tc.function?.name) buf.name = tc.function.name;
          if (tc.function?.arguments) {
            buf.args += tc.function.arguments;
            // 若是 finish 工具，增量提取 answer 并逐段 yield（真流式）
            if (buf.name === "finish") {
              if (finishIdx === null) {
                finishIdx = idx;
                answerExtractor = new StreamingAnswerExtractor();
                // finish 开始时先推送已累积的 toolCalls/citations
                if (toolCalls.length) yield { type: "toolCalls", toolCalls };
                if (citations.length) yield { type: "citations", citations };
              }
              if (answerExtractor) {
                const newText = answerExtractor.feed(tc.function.arguments);
                if (newText) yield { type: "delta", content: newText };
              }
            }
          }
        }
      }
    }

    // ---- 流结束，按 finishReason 分发 ----

    // 路径 A：finish 工具被调用 → 答案已在流式过程中增量推送，收尾
    if (finishIdx !== null && answerExtractor) {
      const fullAnswer = sanitizeLLMOutput(answerExtractor.text);
      let finishArgs: any = {};
      try { finishArgs = JSON.parse(toolBufs.get(finishIdx)!.args || "{}"); } catch {}
      logger.info({ userId, iter, finishReason: "finish_tool", toolCalls: toolCalls.length + 1, answerLen: fullAnswer.length }, "stream done (finish, real-streamed)");
      // 若流式 delta 为空（提取器未匹配到 answer，兜底用完整 args）
      if (!fullAnswer) {
        const fallback = sanitizeLLMOutput(finishArgs.answer || contentAcc || "");
        if (fallback) yield { type: "delta", content: fallback };
        yield { type: "done", answer: fallback, citations, toolCalls: [...toolCalls, { name: "finish", args: finishArgs, resultPreview: "最终答案", type: "tool" }], usage: lastUsage };
      } else {
        yield { type: "done", answer: fullAnswer, citations, toolCalls: [...toolCalls, { name: "finish", args: finishArgs, resultPreview: "最终答案", type: "tool" }], usage: lastUsage };
      }
      return;
    }

    // 整理本轮工具调用（按 index 排序）
    const sortedBufs = [...toolBufs.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b);
    const calledTools = sortedBufs.filter((b) => b.name && b.name !== "finish");

    // 路径 B：无工具调用（finishReason=stop），模型直接输出文字
    if (calledTools.length === 0) {
      const content = sanitizeLLMOutput(contentAcc);
      if (content && content.length > 20) {
        // 模型写了实质内容，接受为最终答案，流式输出
        if (toolCalls.length) yield { type: "toolCalls", toolCalls };
        if (citations.length) yield { type: "citations", citations };
        logger.info({ userId, iter, finishReason: "text_answer", contentLen: content.length }, "stream done (text answer)");
        // text answer 路径：delta.content 已累积到 contentAcc 但未直接 yield，这里按行增量推送
        const segments = content.split(/(?<=\n)/);
        for (const seg of segments) {
          if (seg.trim()) yield { type: "delta", content: seg };
        }
        yield { type: "done", answer: content, citations, toolCalls, usage: lastUsage };
        return;
      }
      if (iter >= config.tuning.agentMaxIters - 1) {
        if (toolCalls.length) yield { type: "toolCalls", toolCalls };
        if (citations.length) yield { type: "citations", citations };
        const answer = "抱歉，我未能获取到足够的信息来回答这个问题。请尝试换一种方式提问，或上传相关文档到知识库。";
        yield { type: "done", answer, citations, toolCalls, usage: lastUsage };
        return;
      }
      const nearLimit = iter >= config.tuning.agentMaxIters - 3;
      logger.info({ userId, iter, nearLimit }, "stream nudged");
      messages.push({ role: "assistant", content: contentAcc || "" });
      messages.push({ role: "user", content: nearLimit
        ? "你已接近工具调用上限。请立即调用 finish 工具，基于已检索的信息给出最终回答。不要再调用其他工具。"
        : "请不要直接回答。请调用 finish 工具传入最终回答，或继续调用检索工具。" });
      continue;
    }

    // 路径 C：非 finish 的工具调用，执行工具循环（非流式，与 agentAnswer 相同逻辑）
    logger.info({ userId, iter, tools: calledTools.map((b) => b.name) }, "stream agent tool calls");
    messages.push({
      role: "assistant",
      content: contentAcc || "",
      tool_calls: sortedBufs.filter((b) => b.id && b.name).map((b) => ({
        id: b.id, type: "function", function: { name: b.name!, arguments: b.args || "{}" },
      })) as any,
    });

    for (const buf of calledTools) {
      let args: Record<string, unknown> = {};
      try { args = buf.args ? JSON.parse(buf.args) : {}; } catch { args = {}; }
      // 网络搜索次数限制：超过上限则拒绝执行，提示模型用已有信息收尾
      if (isWebTool(buf.name!) && webSearchCount >= config.tuning.maxWebSearchPerTurn) {
        const limitMsg = `已达到网络搜索次数上限（${config.tuning.maxWebSearchPerTurn}次），请基于已检索到的信息调用 finish 工具回答，不要再调用网络搜索工具。`;
        messages.push({ role: "tool", tool_call_id: buf.id, content: limitMsg } as ChatCompletionMessageParam);
        continue;
      }
      try {
        // update_note 改文件：执行前抓取 previousContent，执行后推送 doc_patch 供前端 diff
        let prevContent: string | null = null;
        if (buf.name === "update_note" && typeof args.note_id === "string") {
          const db = getDb();
          const [before] = await db.select({ content: schema.documents.contentMd })
            .from(schema.documents)
            .where(and(eq(schema.documents.id, args.note_id), eq(schema.documents.userId, userId)))
            .limit(1);
          prevContent = before?.content ?? "";
        }
        const result = await executeTool(buf.name!, args, ctx);

        if (isWebTool(buf.name!)) webSearchCount++;
        const toolData = result.data as any;
        toolCalls.push({
          name: buf.name!, args, resultPreview: result.content.slice(0, 120),
          resultFull: result.content.slice(0, 1500),
          noteContent: toolData?.noteContent,
          noteTitle: toolData?.title,
          noteDocId: toolData?.documentId,
          type: isWebTool(buf.name!) ? "search" : "tool",
        });
        // 每执行完一个工具，立即推送给前端（让用户看到逐步过程）
        yield { type: "toolCalls", toolCalls: [toolCalls[toolCalls.length - 1]] };
        // doc_patch：update_note 成功且有 noteContent → 推送 diff 载荷
        if (buf.name === "update_note" && toolData?.documentId && prevContent !== null) {
          yield {
            type: "doc_patch",
            docId: toolData.documentId,
            title: toolData?.title,
            content: String(args.content ?? toolData.noteContent ?? ""),
            previousContent: prevContent,
          };
        }
        const data = result.data as any;
        if (data?.chunks && Array.isArray(data.chunks)) {
          data.chunks.forEach((c: any) => {
            const docId = c.docId || "";
            if (docId && citations.some((ex) => ex.docId === docId)) return;
            citations.push({
              n: citations.length + 1,
              chunkId: c.chunkId || "", docId: c.docId || "",
              docTitle: c.docTitle || "", locator: c.locator || null,
              snippet: c.text || c.snippet || "",
            });
          });
        }
        messages.push({ role: "tool", tool_call_id: buf.id, content: result.content } as ChatCompletionMessageParam);
      } catch (e) {
        messages.push({
          role: "tool", tool_call_id: buf.id,
          content: `工具执行失败：${(e as Error).message}`,
        } as ChatCompletionMessageParam);
      }
    }

    // 工具循环内预算检查（Codex 模式）：超阈值时压缩
    const totalTokens = estimateMessagesTokens(messages.map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : "" })));
    if (shouldCompress(totalTokens, model)) {
      messages = messages.map(downgradeToolResult);
      const afterDowngrade = estimateMessagesTokens(messages.map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : "" })));
      if (shouldCompress(afterDowngrade, model)) {
        logger.info({ tokens: afterDowngrade, budget: getInputBudget(model) }, "stream: triggering compression");
        const compressed = await compressHistory(messages, config.tuning.compressRecentKeep, client, model);
        messages = compressed.messages;
      }
    }
  }

  // 超过最大迭代：用已有信息收尾（不报错）
  if (toolCalls.length) yield { type: "toolCalls", toolCalls };
  if (citations.length) yield { type: "citations", citations };
  yield { type: "done", answer: "抱歉，我未能获取到足够的信息来完整回答这个问题。请尝试换一种方式提问，或上传相关文档到知识库。", citations, toolCalls, usage: lastUsage };
}
