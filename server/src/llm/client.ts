import OpenAI from "openai";
import { config } from "../config/index.js";
import { decrypt } from "../config/crypto.js";

/**
 * 双端点架构：
 *   - Chat → DeepSeek 官方（deepseek-v4-pro，reasoning + function calling）
 *   - Embedding → 智谱 embedding-3（1024 维，见 embed.ts 裸 fetch 实现）
 *
 * 计费模型（保留多租户能力）：
 *   用户可绑定自己的 Chat API Key。未绑定时走系统默认（CHAT_API_KEY）。
 *   Embedding 是系统级资源，统一走系统 EMBEDDING_API_KEY。
 */

/** 用户 Chat 凭据（BYOK：可绑定自己的 key + endpoint + model）。 */
export interface UserChatCreds {
  /** 用户绑定的 chat key（加密），未绑定为 null */
  chatApiKeyEnc?: string | null;
  chatModel?: string | null;
  /** 用户自定义的 chat endpoint（BYOK），未设置为 null → 用系统默认 */
  chatBaseUrl?: string | null;
}

/** 解出用户的 chat key。无则返回系统兜底。 */
export function resolveChatApiKey(creds: UserChatCreds): { apiKey: string; fromUser: boolean } {
  if (creds.chatApiKeyEnc) {
    return { apiKey: decrypt(creds.chatApiKeyEnc), fromUser: true };
  }
  return { apiKey: config.chatApiKey, fromUser: false };
}

export function resolveChatModel(creds: UserChatCreds): string {
  const m = creds.chatModel;
  // 兼容历史数据：旧版本默认模型 glm-4.6 已下线，回退到当前默认 DeepSeek
  if (!m || m === "glm-4.6") return config.chatModel;
  return m;
}

/** 解出 chat endpoint：用户自定义 > 系统默认。 */
export function resolveChatBaseUrl(creds: UserChatCreds): string {
  return creds.chatBaseUrl?.trim() || config.chatBaseUrl;
}

/** 构造 chat client（支持 BYOK 自定义 endpoint），带重试和超时。 */
export function makeChatClient(apiKey: string, baseURL?: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: baseURL || config.chatBaseUrl,
    maxRetries: 3,
    timeout: 60_000,
  });
}
