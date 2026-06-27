/**
 * MCP HTTP 路由：POST /api/mcp 挂 StreamableHTTPServerTransport。
 *
 * 鉴权：从 Authorization: Bearer <token> 解出 token，经 resolveTokenUser → userId。
 * 每个 MCP 请求（initialize / tools/list / tools/call）都带这个 token。
 *
 * 三大 harness（Cursor/Codex/Claude Code）通过此端点远程连。
 *
 * 传输：无状态模式（sessionIdGenerator: undefined）。每个 HTTP 请求创建独立
 * transport + server，响应结束后清理。适合 simple-rag 这种无会话状态的服务端知识库。
 */
import type { FastifyInstance } from "fastify";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "../mcp/server.js";
import { resolveTokenUser } from "../mcp/auth.js";

export async function mcpRoutes(app: FastifyInstance) {
  app.post("/mcp", async (req, reply) => {
    // 鉴权：解 token → userId
    const auth = req.headers.authorization || "";
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    if (!m) {
      return reply.code(401).send({ error: "missing MCP token" });
    }
    const userId = await resolveTokenUser(m[1]);
    if (!userId) {
      // 不区分不存在 vs 已吊销 —— 防信息泄漏
      return reply.code(401).send({ error: "invalid or revoked MCP token" });
    }

    // 每个 HTTP 请求创建独立 transport + server。
    // authenticate 回调返回已解出的 userId（避免每个工具调用重复解析）。
    const server = createMcpServer({
      authenticate: async () => userId,
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    // 响应结束后清理，避免泄漏
    reply.raw.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    await server.connect(transport);
    // Fastify 已解析 body；transport.handleRequest 第三参接受已解析的 body
    await transport.handleRequest(req.raw, reply.raw, req.body);
  });
}
