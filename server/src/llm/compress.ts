import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import { estimateTokens, getInputBudget, type HistoryTurn } from "./context.js";
import { logger } from "../config/logger.js";

/**
 * 自动压缩 — 当上下文接近窗口时，用 LLM 总结旧对话。
 *
 * 参考 Codex CLI 的压缩流程：
 *   1. 把待压缩的旧消息发给 LLM，要求总结（保留意图/决策/引用/未决问题）
 *   2. 用 summary 替换旧消息，保留最近 N 轮原文
 *
 * 压缩后的消息结构：[system, {system: summary}, ...recent_turns, user]
 */

const SUMMARIZE_PROMPT = `请总结以下对话历史，用于在保持上下文连贯性的前提下压缩对话长度。

要求：
1. 保留用户提出的每个核心问题及其结论
2. 保留被引用的文档名称和关键事实
3. 保留未解决的后续问题
4. 用简洁的中文，不超过 500 字
5. 用第三人称叙述，不要用对话格式

对话历史：`;

/** 触发压缩并返回压缩后的消息数组。 */
export async function compressHistory(
  messages: ChatCompletionMessageParam[],
  recentKeepCount: number,
  client: OpenAI,
  model: string
): Promise<{ messages: ChatCompletionMessageParam[]; summary: string; savedTokens: number }> {
  // 分割：旧消息（压缩）+ 最近 N 条（保留原文）
  const systemMsg = messages.find((m) => m.role === "system");
  const userQuestion = [...messages].reverse().find((m) => m.role === "user");
  const allTurns = messages.filter((m) => m.role === "user" || m.role === "assistant" || m.role === "tool");

  // 保留最近的 N 条
  const toCompress = allTurns.slice(0, Math.max(0, allTurns.length - recentKeepCount));
  const toKeep = allTurns.slice(Math.max(0, allTurns.length - recentKeepCount));

  if (toCompress.length === 0) {
    return { messages, summary: "", savedTokens: 0 };
  }

  // 构建压缩请求
  const historyText = toCompress
    .map((m) => {
      const role = m.role === "tool" ? "[检索结果]" : m.role === "assistant" ? "助手" : "用户";
      const content = typeof m.content === "string" ? m.content.slice(0, 500) : "[非文本]";
      return `${role}: ${content}`;
    })
    .join("\n\n");

  const tokensBefore = estimateTokens(historyText);

  try {
    const resp = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SUMMARIZE_PROMPT },
        { role: "user", content: historyText },
      ],
      max_tokens: 800,
      temperature: 0.1,
    });

    const summary = resp.choices[0]?.message?.content || "";
    const tokensAfter = estimateTokens(summary);
    const savedTokens = tokensBefore - tokensAfter;

    logger.info({ tokensBefore, tokensAfter, saved: savedTokens, compressed: toCompress.length }, "context compressed");

    // 重建消息：[system, {system: summary}, ...recent, user]
    const rebuilt: ChatCompletionMessageParam[] = [];
    if (systemMsg) rebuilt.push(systemMsg);
    rebuilt.push({ role: "system", content: `【对话历史摘要】\n${summary}` });
    rebuilt.push(...toKeep);
    if (userQuestion) {
      // 确保最后是 user question
      const lastIdx = rebuilt.findIndex((m, i) => i === rebuilt.length - 1 && m.role === "user");
      if (lastIdx === -1) rebuilt.push(userQuestion);
    }

    return { messages: rebuilt, summary, savedTokens };
  } catch (e) {
    logger.error({ err: (e as Error).message }, "compression failed, keeping full history");
    return { messages, summary: "", savedTokens: 0 };
  }
}
