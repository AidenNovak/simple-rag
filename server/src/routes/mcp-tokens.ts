/**
 * MCP token CRUD（Web UI 用，JWT 鉴权）。
 *
 *   POST   /mcp-tokens   {label} → {token, id, label}  明文仅返回一次
 *   GET    /mcp-tokens            → {tokens:[...]}      不含明文
 *   DELETE /mcp-tokens/:id        → {ok:true}           吊销（按 id + userId）
 *
 * 与 MCP 检索路由（/api/mcp，token 鉴权）是两条独立路径。
 * DELETE 强制 userId 隔离：按 id + userId 定位，防越权吊销他人 token。
 */
import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { authGuard, requireUser, type AuthedRequest } from "../auth/middleware.js";
import { createMcpToken, listTokens } from "../mcp/auth.js";
import { getDb, schema } from "../db/client.js";

export async function mcpTokenRoutes(app: FastifyInstance) {
  app.post("/mcp-tokens", { preHandler: [authGuard] }, async (req: AuthedRequest, reply) => {
    const user = requireUser(req);
    const { label } = (req.body || {}) as { label?: string };
    const { plaintext, tokenId } = await createMcpToken(user.id, label);
    reply.send({ token: plaintext, id: tokenId, label });
  });

  app.get("/mcp-tokens", { preHandler: [authGuard] }, async (req: AuthedRequest, reply) => {
    const user = requireUser(req);
    const tokens = await listTokens(user.id);
    reply.send({ tokens });
  });

  app.delete("/mcp-tokens/:id", { preHandler: [authGuard] }, async (req: AuthedRequest, reply) => {
    const user = requireUser(req);
    const { id } = req.params as { id: string };
    // 按 id + userId 定位吊销（强制隔离，防越权）
    const db = getDb();
    await db
      .update(schema.mcpTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.mcpTokens.id, id), eq(schema.mcpTokens.userId, user.id)));
    reply.send({ ok: true });
  });
}
