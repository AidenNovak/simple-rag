/**
 * MCP 只读检索工具。独立于 agent 的 tools/TOOL_DEFS（红线：双结构分离）。
 *
 * 每个工具调用前经 authenticate 解出 userId，透传给现有检索层。
 * 全部只读：search / keyword_search / list_documents / read_chunk。
 * 输出格式复用 agent 工具的 LLM 友好序列化（已验证有效）。
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, getPoolClient } from "../db/client.js";
import { retrieve } from "../rag/retrieve.js";
import type { UserChatCreds } from "../llm/client.js";
import type { McpAuthContext } from "./server.js";

/** 解出 userId；失败抛错（由 MCP 框架转成错误响应）。每个工具入口调用。 */
async function requireUserId(ctx: McpAuthContext): Promise<string> {
  const userId = await ctx.authenticate();
  if (!userId) throw new Error("unauthorized: invalid or missing MCP token");
  return userId;
}

/** chunk → LLM 友好的引用片段字符串。复用 agent 工具的序列化逻辑。 */
function formatChunk(c: {
  docTitle: string;
  text: string;
  locator: Record<string, string | number> | null;
}, index: number): string {
  const loc = c.locator
    ? `（${Object.entries(c.locator).map(([k, v]) => `${k}=${v}`).join(", ")}）`
    : "";
  return `【${index + 1}】来源《${c.docTitle}》${loc}\n${c.text}`;
}

/**
 * retrieve 内部用 embedOne() 走系统 embedding key，creds 参数仅用于类型签名
 * （函数体未实际消费）。传空对象即可 —— 守 creds 边界：MCP 不碰用户 chat key。
 */
const SYSTEM_CREDS = {} as UserChatCreds;

export function registerMcpTools(server: McpServer, ctx: McpAuthContext): void {
  // search — 混合检索（向量 + 关键词 RRF），复用 retrieve()
  server.registerTool(
    "search",
    {
      description:
        "在用户的私人知识库做混合检索（向量 + 关键词 RRF 融合）。返回带引用定位的片段。这是检索已有文档的主要方式。",
      inputSchema: {
        query: z.string().describe("检索问题或关键词"),
        top_k: z.number().int().min(1).max(20).optional().describe("返回数量，默认 5，最大 20"),
      },
    },
    async (args: { query: string; top_k?: number }) => {
      const userId = await requireUserId(ctx);
      const chunks = await retrieve(userId, args.query, SYSTEM_CREDS, {
        topK: Math.min(args.top_k ?? 5, 20),
      });
      const content = chunks.length
        ? chunks
            .map((c, i) => formatChunk({ docTitle: c.docTitle, text: c.text, locator: c.locator }, i))
            .join("\n\n---\n\n")
        : "（未检索到相关内容）";
      return { content: [{ type: "text" as const, text: content }] };
    }
  );

  // keyword_search — 纯 trigram，快，不走 embedding
  server.registerTool(
    "keyword_search",
    {
      description:
        "全文关键词检索（纯 trigram，不走向量，速度快）。适合精确术语、代码标识符匹配。",
      inputSchema: {
        query: z.string().describe("关键词"),
        top_k: z.number().int().min(1).max(20).optional().describe("返回数量，默认 5"),
      },
    },
    async (args: { query: string; top_k?: number }) => {
      const userId = await requireUserId(ctx);
      const client = await getPoolClient();
      try {
        const res = await client.query(
          `SELECT c.id, c.doc_id, c.ordinal, c.text, c.locator, d.title
           FROM chunks c JOIN documents d ON d.id = c.doc_id
           WHERE c.user_id = $1 AND c.text % $2
           ORDER BY similarity(c.text, $2) DESC LIMIT $3`,
          [userId, args.query, Math.min(args.top_k ?? 5, 20)]
        );
        const content = res.rows.length
          ? res.rows
              .map((r: any, i: number) =>
                formatChunk({ docTitle: r.title, text: r.text, locator: r.locator }, i)
              )
              .join("\n\n---\n\n")
          : "（无关键词匹配）";
        return { content: [{ type: "text" as const, text: content }] };
      } finally {
        client.release();
      }
    }
  );

  // list_documents — 列出用户文档（带状态）
  server.registerTool(
    "list_documents",
    {
      description:
        "列出用户知识库中的所有文档（标题、状态、格式）。用于了解有哪些可检索的内容。",
    },
    async () => {
      const userId = await requireUserId(ctx);
      const db = getDb();
      const rows = await db
        .select({
          id: schema.documents.id,
          title: schema.documents.title,
          status: schema.documents.status,
          kind: schema.documents.kind,
          sourceFormat: schema.documents.sourceFormat,
        })
        .from(schema.documents)
        .where(eq(schema.documents.userId, userId));
      const content = rows.length
        ? rows
            .map(
              (d) =>
                `- 《${d.title}》[${d.status}] ${d.kind === "note" ? "笔记" : d.sourceFormat || "文件"}`
            )
            .join("\n")
        : "（知识库为空）";
      return { content: [{ type: "text" as const, text: content }] };
    }
  );

  // read_chunk — 读单个 chunk 全文
  server.registerTool(
    "read_chunk",
    {
      description:
        "读取指定 chunk 的完整文本内容。用于深入查看检索到的片段。需要 chunk_id（来自 search/keyword_search 的结果）。",
      inputSchema: {
        chunk_id: z.string().describe("chunk ID"),
      },
    },
    async (args: { chunk_id: string }) => {
      const userId = await requireUserId(ctx);
      const client = await getPoolClient();
      try {
        const res = await client.query(
          `SELECT c.text, c.locator, d.title FROM chunks c JOIN documents d ON d.id = c.doc_id
           WHERE c.id = $1 AND c.user_id = $2`,
          [args.chunk_id, userId]
        );
        if (res.rows.length === 0) {
          return { content: [{ type: "text" as const, text: "（未找到该片段，或无权访问）" }] };
        }
        const r = res.rows[0];
        const loc = r.locator
          ? `（${Object.entries(r.locator).map(([k, v]) => `${k}=${v}`).join(", ")}）`
          : "";
        return { content: [{ type: "text" as const, text: `《${r.title}》${loc}\n\n${r.text}` }] };
      } finally {
        client.release();
      }
    }
  );
}
