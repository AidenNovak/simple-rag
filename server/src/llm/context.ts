import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import { config } from "../config/index.js";

/**
 * 上下文管理 — token 计数、上下文窗口、预算分配、消息构建。
 *
 * 参考 Codex CLI 的预算模型：
 *   input_budget = context_window − reserved_output − tool_reserve
 *   保留：system prompt + 最近 N 轮 + 当前问题
 *   超预算时：旧 tool 结果先降级为 stub，再丢弃最旧轮次
 *
 * 可调参数在 config.tuning，不再硬编码。
 */

// ---- 模型上下文窗口映射 ----
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  "deepseek-v4-pro": 1_000_000, // 1M（实际最佳 150K-300K）
  "deepseek-v4-flash": 128_000,
  "deepseek-chat": 128_000,
  "deepseek-reasoner": 128_000,
};

const DEFAULT_CONTEXT_WINDOW = 128_000;

export function getContextWindow(model: string): number {
  // 精确匹配优先，否则前缀匹配（deepseek-v4-pro-xxx → deepseek-v4-pro）
  if (MODEL_CONTEXT_WINDOWS[model]) return MODEL_CONTEXT_WINDOWS[model];
  for (const key of Object.keys(MODEL_CONTEXT_WINDOWS)) {
    if (model.startsWith(key)) return MODEL_CONTEXT_WINDOWS[key];
  }
  return DEFAULT_CONTEXT_WINDOW;
}

export function getInputBudget(model: string): number {
  return getContextWindow(model) - config.tuning.contextReservedOutput - config.tuning.contextToolReserve;
}

// ---- Token 估算（DeepSeek 官方比例：CJK×0.6, 其他×0.3）----
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  const other = text.length - cjk;
  return Math.ceil(cjk * 0.6 + other * 0.3 + 4); // +4 每条消息的 framing 开销
}

export function estimateMessagesTokens(messages: { role: string; content: string }[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}

/** 是否需要压缩：当前 token 超过预算阈值。 */
export function shouldCompress(totalTokens: number, model: string): boolean {
  return totalTokens > config.tuning.compressThreshold * getInputBudget(model);
}

// ---- 上下文消息构建 ----

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
  /** tool 结果标记（检索类消息是最大 token 消耗者） */
  isToolResult?: boolean;
}

/**
 * 构建发给 LLM 的消息数组，保证不超预算。
 *
 * 策略（从最新往最旧纳入）：
 *   1. system prompt（固定保留）
 *   2. 最近 MIN_RECENT_TURNS 轮（固定保留）
 *   3. 剩余预算内纳入更早的轮次
 *   4. 超预算时：旧 tool 结果降级为 stub，再丢弃最旧轮
 */
export function buildContextMessages(
  systemPrompt: string,
  history: HistoryTurn[],
  question: string,
  model: string
): { messages: ChatCompletionMessageParam[]; tokensUsed: number; budget: number; compressed: boolean } {
  const budget = getInputBudget(model);
  const systemTokens = estimateTokens(systemPrompt);
  const questionTokens = estimateTokens(question);
  let tokensUsed = systemTokens + questionTokens;

  const kept: HistoryTurn[] = [];

  // 从最新往最旧纳入
  const reversed = [...history].reverse();

  // 第 1 阶段：固定保留最近 N 轮
  const recent = reversed.slice(0, config.tuning.contextMinRecentTurns * 2);
  for (const turn of recent) {
    const t = estimateTokens(turn.content);
    tokensUsed += t;
    kept.unshift(turn);
  }

  // 第 2 阶段：剩余历史，预算内纳入；超预算时先降级 tool 结果
  const older = reversed.slice(config.tuning.contextMinRecentTurns * 2);
  // 先降级：把旧的 tool 结果替换为 stub
  const downgraded = older.map((t) =>
    t.isToolResult ? { ...t, content: "[检索结果已省略以节省上下文]" } : t
  );

  for (const turn of downgraded) {
    const t = estimateTokens(turn.content);
    if (tokensUsed + t > budget * config.tuning.compressThreshold) break; // 接近阈值就停
    tokensUsed += t;
    kept.unshift(turn);
  }

  // 构建最终消息数组
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...kept.map((t) => ({ role: t.role, content: t.content }) as ChatCompletionMessageParam),
    { role: "user", content: question },
  ];

  const compressed = older.length > 0 && kept.length < history.length;

  return { messages, tokensUsed, budget, compressed };
}

/** 降级单条 tool 结果为 stub（循环内压缩用）。 */
export function downgradeToolResult(msg: ChatCompletionMessageParam): ChatCompletionMessageParam {
  if (msg.role === "tool" && typeof msg.content === "string" && msg.content.length > 100) {
    return { ...msg, content: "[检索结果已省略以节省上下文]" };
  }
  return msg;
}
