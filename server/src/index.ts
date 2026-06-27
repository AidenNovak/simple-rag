/**
 * private-kb API 入口。
 *
 * 启动顺序：
 *   1. 加载 .env（已在 config/index.ts 顶层完成）
 *   2. 跑数据库迁移
 *   3. 注册 Fastify 插件 + 路由
 *   4. 监听端口
 *
 * 摄入 Worker 单独进程启动（npm run dev:worker），主进程只接 API。
 */
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import fs from "node:fs/promises";
import { config } from "./config/index.js";
import { isAppError, AppError } from "./errors.js";
import { runMigrations } from "./db/migrate.js";
import { closeDb } from "./db/client.js";
import { authRoutes } from "./routes/auth.js";
import { documentRoutes } from "./routes/documents.js";
import { chatRoutes } from "./routes/chat.js";
import { searchRoutes } from "./routes/search.js";
import { exportRoutes } from "./routes/export.js";
import { mcpRoutes } from "./routes/mcp.js";
import { mcpTokenRoutes } from "./routes/mcp-tokens.js";
import { logger } from "./config/logger.js";

async function main() {
  // 迁移
  await runMigrations();

  // 存储目录
  await fs.mkdir(path.resolve(config.uploadDir), { recursive: true });
  await fs.mkdir(path.resolve(config.chunkDir), { recursive: true });

  const app = Fastify({
    logger: false,
    bodyLimit: 50 * 1024 * 1024, // 50MB 上传上限
  });

  await app.register(cors, {
    origin: config.corsOrigin,
    credentials: true,
  });
  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  });

  // ---- 内存限流（防暴力请求，per-IP）----
  // 认证和未认证用各自独立的计数器，避免共享导致误伤。
  // 只限 /api/ 路径，静态资源和前端路由不计入。
  const rateAuthed = new Map<string, { count: number; reset: number }>();
  const rateAnon = new Map<string, { count: number; reset: number }>();
  const RATE_WINDOW_MS = 60_000;
  const RATE_MAX = config.tuning.rateLimitPerMin;      // 未认证：200/min
  const RATE_MAX_AUTHED = RATE_MAX * 10;                // 认证：2000/min
  app.addHook("onRequest", async (req, reply) => {
    if (!req.url.startsWith("/api/")) return;
    if (req.url === "/api/health") return;
    const ip = req.ip;
    const now = Date.now();
    const hasAuth = !!(req.headers.authorization || "");
    const map = hasAuth ? rateAuthed : rateAnon;
    const limit = hasAuth ? RATE_MAX_AUTHED : RATE_MAX;
    let entry = map.get(ip);
    if (!entry || now > entry.reset) { entry = { count: 0, reset: now + RATE_WINDOW_MS }; map.set(ip, entry); }
    entry.count++;
    if (entry.count > limit) {
      reply.header("Retry-After", "60");
      return reply.code(429).send({ error: "请求过于频繁，请稍后再试" });
    }
  });

  // 健康检查
  app.get("/health", async () => ({ ok: true, ts: new Date().toISOString() }));

  // 业务路由
  await app.register(authRoutes, { prefix: "/api" });
  await app.register(documentRoutes, { prefix: "/api" });
  await app.register(chatRoutes, { prefix: "/api" });
  await app.register(searchRoutes, { prefix: "/api" });
  await app.register(exportRoutes, { prefix: "/api" });
  await app.register(mcpRoutes, { prefix: "/api" });
  await app.register(mcpTokenRoutes, { prefix: "/api" });

  // 生产：托管前端静态资源
  if (config.nodeEnv === "production") {
    const webDist = path.resolve(process.cwd(), "web/dist");
    try {
      await fs.access(webDist);
      await app.register(fastifyStatic, { root: webDist, prefix: "/" });
      // SPA fallback
      app.setNotFoundHandler(async (req, reply) => {
        if (!req.url.startsWith("/api")) {
          return reply.sendFile("index.html");
        }
        reply.code(404).send({ error: "not found" });
      });
    } catch {
      logger.warn("web/dist not found, skipping static serving");
    }
  }

  // 全局错误处理（AppError 层级自动映射状态码，不泄露内部细节）
  app.setErrorHandler((err: unknown, req, reply) => {
    const status = isAppError(err) ? (err as AppError).status : 500;
    if (status >= 500) {
      logger.error({ err, url: req.url, method: req.method, ip: req.ip }, "server error");
    } else {
      logger.warn({ err: (err as Error).message, url: req.url, status }, "client error");
    }
    const msg = isAppError(err) ? (err as Error).message : "服务器内部错误，请稍后重试";
    reply.code(status).send({ error: msg });
  });

  await app.listen({ port: config.port, host: "0.0.0.0" });
  logger.info({ port: config.port, env: config.nodeEnv }, "private-kb server started");

  // 优雅关闭（带超时保护 + Redis 清理）
  let shuttingDown = false;
  const shutdown = async (sig: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ sig }, "shutting down");
    // 超时强退保护
    const forceExit = setTimeout(() => { logger.error("shutdown timeout, force exit"); process.exit(1); }, 10_000);
    forceExit.unref();
    try {
      await app.close();
      await closeDb();
    } catch (e) {
      logger.error({ err: e }, "shutdown error");
    }
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("uncaughtException", (e) => logger.error({ err: e }, "uncaughtException"));
  process.on("unhandledRejection", (e) => logger.error({ err: e }, "unhandledRejection"));
}

main().catch((e) => {
  logger.error({ err: e }, "fatal startup error");
  process.exit(1);
});
