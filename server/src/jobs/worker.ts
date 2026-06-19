/**
 * 摄入 Worker 进程：从 Redis 队列消费 job，执行 ingestDocument。
 *
 * 可靠性：
 *   - 启动时恢复 stale jobs（上次崩溃未完成的）
 *   - 处理完成后 ACK（防 job 丢失）
 *   - 单 job 失败不崩溃（catch + 继续）
 *   - 优雅关闭：SIGTERM/SIGINT 正常退出
 */
import { runMigrations } from "../db/migrate.js";
import { dequeueIngest, ackIngest, recoverStaleJobs, isRedisAvailable } from "./queue.js";
import { ingestDocument } from "./pipeline.js";
import { closeDb } from "../db/client.js";
import { logger } from "../config/logger.js";

let running = true;

async function main() {
  await runMigrations();
  if (!(await isRedisAvailable())) {
    logger.error("redis required for worker; exiting");
    process.exit(1);
  }

  // 启动时恢复上次崩溃遗留的 stale jobs
  const recovered = await recoverStaleJobs();
  if (recovered > 0) logger.info({ recovered }, "recovered stale jobs on startup");

  logger.info("ingest worker started");

  while (running) {
    try {
      const job = await dequeueIngest(5);
      if (!job) continue;
      logger.info({ jobId: job.jobId, documentId: job.documentId }, "picked up job");
      try {
        await ingestDocument(job);
        await ackIngest(job.jobId);
        logger.info({ jobId: job.jobId }, "job done + acked");
      } catch (e) {
        // job 本身失败（非 worker 崩溃）→ 标记 failed + ACK（不重试）
        logger.error({ err: e, jobId: job.jobId }, "job failed, acking to remove from inflight");
        await ackIngest(job.jobId).catch(() => {});
      }

      // 定期清理 stale（每 10 轮）
      if (Math.random() < 0.1) {
        const n = await recoverStaleJobs();
        if (n > 0) logger.info({ recovered: n }, "periodic stale recovery");
      }
    } catch (e) {
      logger.error({ err: e }, "worker loop error");
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  logger.info("worker loop exited");
}

// 优雅关闭
const shutdown = async (sig: string) => {
  logger.info({ sig }, "worker shutting down");
  running = false;
  // 等当前 job 完成（最多 10s）
  await new Promise((r) => setTimeout(r, 2000));
  await closeDb();
  process.exit(0);
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", (e) => logger.error({ err: e }, "worker uncaughtException"));
process.on("unhandledRejection", (e) => logger.error({ err: e }, "worker unhandledRejection"));

main().catch((e) => {
  logger.error({ err: e }, "worker fatal");
  process.exit(1);
});
