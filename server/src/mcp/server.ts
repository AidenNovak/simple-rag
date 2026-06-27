/**
 * MCP server 工厂：创建一个挂载了 4 个只读检索工具的 McpServer。
 *
 * 每个工具调用通过 authenticate 回调解出 userId，透传给检索层。
 * 工具全部只读，强制 user_id 隔离 —— 这是 simple-rag 相对 OpenKnowledge 的安全优势。
 *
 * 工具 schema 与 agent 的 TOOL_DEFS 完全独立（红线：tools/TOOL_DEFS 分离）。
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMcpTools } from "./tools.js";

export interface McpAuthContext {
  /** 从请求头/上下文解出 userId。失败返回 null（由调用方决定如何拒绝）。 */
  authenticate: () => Promise<string | null>;
}

/**
 * 创建 MCP server 并注册只读检索工具。
 * authenticate 回调在每个工具调用时执行，解出 userId 透传。
 */
export function createMcpServer(ctx: McpAuthContext): McpServer {
  const server = new McpServer(
    { name: "simple-rag", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );
  registerMcpTools(server, ctx);
  return server;
}
