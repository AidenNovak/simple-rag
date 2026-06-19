/**
 * Chat 消息类型定义。
 *
 * 实际的 chat 调用在 rag/agent.ts 中直接用 makeChatClient + 原生 SDK 完成
 *（因为需要 function calling 循环，简单的封装层反而碍事）。
 * 这里只保留共享的类型定义。
 */

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}
