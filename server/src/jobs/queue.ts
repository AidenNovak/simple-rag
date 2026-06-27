/**
 * 异步摄入队列：基于 Redis BLPOP + ACK 机制。
 *
 * 可靠性设计（修复 job 丢失 bug）：
 *   - dequeue 时把 job 移到 inflight set（不立即删 payload）
 *   - 处理完成后 ACK（删 payload + 移出 inflight）
 *   - worker 崩溃后，inflight 中的 job 可被恢复（requeue stale jobs）
 *
 * 队列结构：
 *   - List `ingest:queue`     待处理 job id
 *   - Hash `ingest:job:{id}`  job payload
 *   - ZSet `ingest:inflight`  处理中 job（score=开始时间戳），用于超时恢复
 */
import { randomUUID } from "node:crypto";
import { logger } from "../config/logger.js";

let _redis: any = null;
async function redis() {
  if (_redis) return _redis;
  try {
    const { default: Redis } = await import("ioredis");
    const { config } = await import("../config/index.js");
    _redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null, lazyConnect: false });
    return _redis;
  } catch {
    logger.warn("redis unavailable, ingest will run inline (dev fallback)");
    return null;
  }
}

/** 关闭 Redis 连接（仅供测试 teardown 让进程能退出，生产无需调用）。 */
export async function closeRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit().catch(() => {});
    _redis = null;
  }
}

export interface IngestJob {
  jobId: string;
  documentId: string;
  userId: string;
}

const INFLIGHT_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟未 ACK 视为 stale

export async function enqueueIngest(job: Omit<IngestJob, "jobId">): Promise<IngestJob> {
  const full: IngestJob = { jobId: randomUUID(), ...job };
  const r = await redis();
  if (!r) {
    // 无 Redis → 同步执行（dev）
    const { ingestDocument } = await import("./pipeline.js");
    ingestDocument(full).catch((e) => logger.error({ err: e }, "inline ingest failed"));
    return full;
  }
  try {
    await r.hset(`ingest:job:${full.jobId}`, full as any);
    await r.lpush("ingest:queue", full.jobId);
    logger.info({ jobId: full.jobId, documentId: full.documentId }, "ingest enqueued");
  } catch (e) {
    // Redis 故障 → 降级同步执行
    logger.warn({ err: (e as Error).message }, "redis enqueue failed, running inline");
    const { ingestDocument } = await import("./pipeline.js");
    ingestDocument(full).catch((err) => logger.error({ err: err }, "inline ingest failed"));
  }
  return full;
}

/** 取出一个 job 并标记为 inflight（不删 payload，防崩溃丢失）。 */
export async function dequeueIngest(timeoutSec = 5): Promise<IngestJob | null> {
  const r = await redis();
  if (!r) return null;
  const res = await r.brpop("ingest:queue", timeoutSec);
  if (!res) return null;
  const jobId = res[1];
  // 移到 inflight（score=当前时间戳），payload 保留
  await r.zadd("ingest:inflight", Date.now(), jobId);
  const payload = await r.hgetall(`ingest:job:${jobId}`);
  if (!payload || !payload.documentId) {
    // 损坏的 job → 清理
    await r.zrem("ingest:inflight", jobId);
    await r.del(`ingest:job:${jobId}`);
    return null;
  }
  return payload as unknown as IngestJob;
}

/** ACK：处理成功后清理 job。 */
export async function ackIngest(jobId: string): Promise<void> {
  const r = await redis();
  if (!r) return;
  await r.zrem("ingest:inflight", jobId);
  await r.del(`ingest:job:${jobId}`);
}

/** 恢复 stale jobs：inflight 超时未 ACK 的重新入队。 */
export async function recoverStaleJobs(): Promise<number> {
  const r = await redis();
  if (!r) return 0;
  const cutoff = Date.now() - INFLIGHT_TIMEOUT_MS;
  const stale = await r.zrangebyscore("ingest:inflight", "-inf", cutoff);
  for (const jobId of stale) {
    await r.zrem("ingest:inflight", jobId);
    await r.lpush("ingest:queue", jobId);
    logger.warn({ jobId }, "recovered stale ingest job");
  }
  return stale.length;
}

export async function isRedisAvailable(): Promise<boolean> {
  return (await redis()) !== null;
}
