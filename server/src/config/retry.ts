import { logger } from "./logger.js";

/**
 * 通用重试包装器（指数退避）。
 *
 * 用于 LLM / embedding / 外部 API 调用的瞬时故障恢复。
 * 区分可重试错误（429/5xx/超时/网络）与不可重试错误（400/401/403）。
 */
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/** 判断错误是否值得重试。 */
function isRetryable(err: unknown): boolean {
  const msg = (err as any)?.message || String(err);
  const status = (err as any)?.status || (err as any)?.statusCode;
  // 429 限流、5xx 服务端错误、超时、网络中断
  if (status === 429 || (status >= 500 && status <= 599)) return true;
  if (/timeout|timed out|ECONNRESET|ENOTFOUND|ECONNREFUSED|socket hang up|fetch failed|network/i.test(msg)) return true;
  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxRetries?: number; label?: string } = {}
): Promise<T> {
  const max = opts.maxRetries ?? MAX_RETRIES;
  const label = opts.label || "operation";
  let lastErr: unknown;

  for (let attempt = 0; attempt <= max; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === max || !isRetryable(err)) throw err;
      const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 500;
      logger.warn({ label, attempt: attempt + 1, max, delay: Math.round(delay), err: (err as Error).message.slice(0, 100) }, "retrying");
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
