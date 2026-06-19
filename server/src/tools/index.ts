/**
 * 工具调用框架（Agent + RAG）
 *
 * 设计：助手可调用一组知识库工具（检索 / 管理 / 网络搜索），由 DeepSeek
 * 的原生 function calling 驱动（OpenAI 兼容端点，默认 DeepSeek 官方 / 可 BYOK）。每轮对话：
 *   1. 系统提示列出可用工具
 *   2. LLM 决定调用哪个工具（function call）
 *   3. 服务端执行工具，把结果作为 tool 回填喂回
 *   4. LLM 基于工具结果 + 历史生成最终答案
 *
 * 工具按用户隔离：每个工具接收 userId，内部强制 WHERE user_id 过滤。
 */
import { eq, and } from "drizzle-orm";
import { getDb, schema, getPoolClient } from "../db/client.js";
import { retrieve, type RetrievedChunk } from "../rag/retrieve.js";
import type { UserChatCreds } from "../llm/client.js";

// ---- OpenAI 兼容的 tool 定义（DeepSeek function calling 用此格式）----
export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
}

export interface ToolResult {
  name: string;
  /** 序列化后的字符串，喂回 LLM */
  content: string;
  /** 结构化数据，用于前端展示「调用了哪些工具」 */
  data?: unknown;
}

export interface ToolContext {
  userId: string;
  creds: UserChatCreds;
  /** 会话级文档范围。null = 全部文档。 */
  docIds?: string[] | null;
}

// ---- 工具实现 ----
const tools = {
  /** 默认：混合检索知识库（向量 + 关键词 RRF），支持文档范围过滤 */
  search_knowledge_base: async (args: { query: string; top_k?: number }, ctx: ToolContext): Promise<ToolResult> => {
    const chunks = await retrieve(ctx.userId, args.query, ctx.creds, { topK: args.top_k ?? 5, docIds: ctx.docIds });
    const content = chunks.length
      ? chunks
          .map((c, i) => {
            const loc = c.locator ? `（${Object.entries(c.locator).map(([k, v]) => `${k}=${v}`).join(", ")}）` : "";
            return `【${i + 1}】来源《${c.docTitle}》${loc}\n${c.text}`;
          })
          .join("\n\n---\n\n")
      : "（未检索到相关内容）";
    return { name: "search_knowledge_base", content, data: { count: chunks.length, chunks: chunks.map(toCitation) } };
  },

  /** 全文关键词检索（纯 trigram，不走 embedding，快） */
  keyword_search: async (args: { query: string; top_k?: number }, ctx: ToolContext): Promise<ToolResult> => {
    const client = await getPoolClient();
    try {
      const res = await client.query(
        `SELECT c.id, c.doc_id, c.ordinal, c.text, c.locator, d.title,
                similarity(c.text, $2) AS sim
         FROM chunks c JOIN documents d ON d.id = c.doc_id
         WHERE c.user_id = $1 AND c.text % $2
         ORDER BY sim DESC LIMIT $3`,
        [ctx.userId, args.query, args.top_k ?? 5]
      );
      const content = res.rows.length
        ? res.rows.map((r: any, i: number) => `【${i + 1}】《${r.title}》\n${r.text}`).join("\n\n---\n\n")
        : "（无关键词匹配）";
      return { name: "keyword_search", content, data: { count: res.rows.length } };
    } finally {
      client.release();
    }
  },

  /** 列出用户文档（带状态） */
  list_documents: async (_args: {}, ctx: ToolContext): Promise<ToolResult> => {
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.userId, ctx.userId));
    const content = rows.length
      ? rows
          .map((d) => `- 《${d.title}》[${d.status}] ${d.kind === "note" ? "笔记" : d.sourceFormat || "文件"}`)
          .join("\n")
      : "（知识库为空）";
    return { name: "list_documents", content, data: { count: rows.length, documents: rows.map((d) => ({ id: d.id, title: d.title, status: d.status })) } };
  },

  /** 查询某文档的摄入状态（强制 userId 隔离，防 IDOR） */
  get_document_status: async (args: { document_id?: string; title?: string }, ctx: ToolContext): Promise<ToolResult> => {
    const db = getDb();
    let row: typeof schema.documents.$inferSelect | undefined;
    if (args.document_id) {
      const [r] = await db.select().from(schema.documents)
        .where(and(eq(schema.documents.id, args.document_id), eq(schema.documents.userId, ctx.userId))).limit(1);
      row = r;
    } else if (args.title) {
      const [r] = await db.select().from(schema.documents)
        .where(and(eq(schema.documents.title, args.title), eq(schema.documents.userId, ctx.userId))).limit(1);
      row = r;
    }
    if (!row) return { name: "get_document_status", content: "（未找到该文档）" };
    const content = `《${row.title}》状态：${row.status}${row.errorMsg ? `，错误：${row.errorMsg}` : ""}`;
    return { name: "get_document_status", content, data: { id: row.id, title: row.title, status: row.status } };
  },

  /** 创建笔记（用户说"帮我记下…"时自动入库） */
  create_note: async (args: { title: string; content: string }, ctx: ToolContext): Promise<ToolResult> => {
    const db = getDb();
    const [doc] = await db
      .insert(schema.documents)
      .values({
        userId: ctx.userId,
        title: args.title,
        kind: "note",
        sourceFormat: "md",
        contentMd: args.content,
        status: "pending",
      })
      .returning();
    // 异步入队摄入（让笔记可被后续检索）
    const { enqueueIngest } = await import("../jobs/queue.js");
    await enqueueIngest({ documentId: doc.id, userId: ctx.userId });
    return {
      name: "create_note",
      content: `已创建笔记《${doc.title}》并开始摄入知识库（文档ID: ${doc.id}）。`,
      data: { documentId: doc.id, title: doc.title, noteContent: args.content },
    };
  },

  /** 列出所有笔记（仅 kind=note） */
  list_notes: async (_args: {}, ctx: ToolContext): Promise<ToolResult> => {
    const db = getDb();
    const rows = await db.select({
      id: schema.documents.id, title: schema.documents.title,
      status: schema.documents.status, updatedAt: schema.documents.updatedAt,
    }).from(schema.documents)
      .where(and(eq(schema.documents.userId, ctx.userId), eq(schema.documents.kind, "note")));
    const content = rows.length
      ? rows.map((n, i) => `${i + 1}. 《${n.title}》[${n.status}] (ID: ${n.id})`).join("\n")
      : "（还没有笔记）";
    return { name: "list_notes", content, data: { count: rows.length, notes: rows } };
  },

  /** 获取笔记完整内容 */
  get_note: async (args: { note_id?: string; title?: string }, ctx: ToolContext): Promise<ToolResult> => {
    const db = getDb();
    let row: any;
    if (args.note_id) {
      [row] = await db.select().from(schema.documents)
        .where(and(eq(schema.documents.id, args.note_id), eq(schema.documents.userId, ctx.userId), eq(schema.documents.kind, "note"))).limit(1);
    } else if (args.title) {
      [row] = await db.select().from(schema.documents)
        .where(and(eq(schema.documents.title, args.title), eq(schema.documents.userId, ctx.userId), eq(schema.documents.kind, "note"))).limit(1);
    }
    if (!row) return { name: "get_note", content: "（未找到该笔记）" };
    return { name: "get_note", content: `《${row.title}》\n\n${row.contentMd || "（空）"}`, data: { id: row.id, title: row.title, content: row.contentMd, noteContent: row.contentMd } };
  },

  /** 修改笔记（更新标题/内容，自动重新摄入） */
  update_note: async (args: { note_id: string; title?: string; content: string }, ctx: ToolContext): Promise<ToolResult> => {
    const db = getDb();
    const patch: any = { contentMd: args.content, status: "pending" };
    if (args.title) patch.title = args.title;
    const [updated] = await db.update(schema.documents).set(patch)
      .where(and(eq(schema.documents.id, args.note_id), eq(schema.documents.userId, ctx.userId), eq(schema.documents.kind, "note"))).returning();
    if (!updated) return { name: "update_note", content: "（未找到该笔记）" };
    const { enqueueIngest } = await import("../jobs/queue.js");
    await enqueueIngest({ documentId: updated.id, userId: ctx.userId });
    return {
      name: "update_note",
      content: `已更新笔记《${updated.title}》并重新摄入知识库。`,
      data: { documentId: updated.id, title: updated.title, noteContent: args.content },
    };
  },

  /** 删除笔记 */
  delete_note: async (args: { note_id: string }, ctx: ToolContext): Promise<ToolResult> => {
    const db = getDb();
    const [deleted] = await db.delete(schema.documents)
      .where(and(eq(schema.documents.id, args.note_id), eq(schema.documents.userId, ctx.userId), eq(schema.documents.kind, "note"))).returning();
    if (!deleted) return { name: "delete_note", content: "（未找到该笔记）" };
    return { name: "delete_note", content: `已删除笔记《${deleted.title}》。`, data: { deletedId: deleted.id } };
  },

  /**
   * 终止信号：模型完成所有检索后调用此工具给出最终答案。
   * agent 循环只有在此工具被调用时才结束（而非模型自行 stop）。
   */
  finish: async (args: { answer: string }, _ctx: ToolContext): Promise<ToolResult> => {
    return { name: "finish", content: args.answer, data: { finished: true, answer: args.answer } };
  },

  /**
   * 获取当前时间：让模型知道实时日期时间。
   */
  get_time: async (_args: {}, _ctx: ToolContext): Promise<ToolResult> => {
    const now = new Date();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return {
      name: "get_time",
      content: `当前时间: ${now.toISOString()}\n时区: ${tz}\n本地时间: ${now.toLocaleString("zh-CN", { timeZone: tz })}`,
    };
  },

  /**
   * 网络搜索（Tavily API）：搜索互联网获取最新信息。
   * 用于知识库中没有的内容，或用户问最新事件时。
   */
  web_search: async (args: { query: string }, _ctx: ToolContext): Promise<ToolResult> => {
    const apiKey = process.env.TAVILY_API_KEY || "";
    if (!apiKey) return { name: "web_search", content: "（网络搜索未配置）" };
    try {
      const resp = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query: args.query,
          max_results: 2,
          include_answer: true,
          include_raw_content: false,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        return { name: "web_search", content: `搜索失败 (HTTP ${resp.status}): ${txt.slice(0, 100)}` };
      }
      const data: any = await resp.json();
      const answer = data.answer || "";
      const results = (data.results || []).slice(0, 5);
      const content = (answer ? `摘要: ${answer}\n\n` : "") + results.map((r: any, i: number) =>
        `【${i + 1}】${r.title || "(无标题)"}\n来源: ${r.url || ""}\n${(r.content || "").slice(0, 800)}`
      ).join("\n\n---\n\n") || "（无搜索结果）";
      return { name: "web_search", content, data: { count: results.length, sources: results.map((r: any) => r.url) } };
    } catch (e) {
      return { name: "web_search", content: `搜索出错: ${(e as Error).message}` };
    }
  },

  /**
   * 网页抓取（Tavily extract）：抓取指定 URL 的内容。
   */
  web_scrape: async (args: { url: string }, _ctx: ToolContext): Promise<ToolResult> => {
    const apiKey = process.env.TAVILY_API_KEY || "";
    if (!apiKey) return { name: "web_scrape", content: "（网络抓取未配置）" };
    try {
      const resp = await fetch("https://api.tavily.com/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey, urls: [args.url] }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        return { name: "web_scrape", content: `抓取失败 (HTTP ${resp.status}): ${txt.slice(0, 100)}` };
      }
      const data: any = await resp.json();
      const result = data.results?.[0] || {};
      const content = result.raw_content || result.content || "（无内容）";
      return { name: "web_scrape", content: `来源: ${args.url}\n\n${content.slice(0, 3000)}`, data: { url: args.url } };
    } catch (e) {
      return { name: "web_scrape", content: `抓取出错: ${(e as Error).message}` };
    }
  },
} satisfies Record<string, (args: any, ctx: ToolContext) => Promise<ToolResult>>;

// ---- 工具 schema 定义（喂给 LLM）----
export const TOOL_DEFS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "search_knowledge_base",
      description: "检索用户的私人知识库，返回最相关的文档片段（向量+关键词混合检索）。这是回答基于知识库问题的首选工具。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "检索查询，用自然语言描述要找的内容" },
          top_k: { type: "integer", description: "返回片段数量，默认 5", minimum: 1, maximum: 15 },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "keyword_search",
      description: "按关键词精确检索知识库（全文匹配，适合查找专有名词、术语、人名等）。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "关键词" },
          top_k: { type: "integer", description: "返回数量，默认 5", minimum: 1, maximum: 15 },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_documents",
      description: "列出用户知识库中的所有文档及其当前状态。",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_document_status",
      description: "查询某个文档的处理状态（是否已就绪可被检索）。",
      parameters: {
        type: "object",
        properties: {
          document_id: { type: "string", description: "文档ID（可选）" },
          title: { type: "string", description: "文档标题（可选，与 document_id 二选一）" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_note",
      description: "创建一条笔记并存入知识库（当用户要求记录、备忘、写下某内容时使用）。笔记会自动入库可被检索。",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "笔记标题" },
          content: { type: "string", description: "笔记正文（Markdown）" },
        },
        required: ["title", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_notes",
      description: "列出用户的所有笔记及其状态。",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_note",
      description: "获取某条笔记的完整内容（用于查看或修改前读取）。",
      parameters: {
        type: "object",
        properties: {
          note_id: { type: "string", description: "笔记ID" },
          title: { type: "string", description: "笔记标题（与 note_id 二选一）" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_note",
      description: "修改笔记内容（用户要求更新、补充、修改某条笔记时使用）。修改后自动重新摄入知识库。",
      parameters: {
        type: "object",
        properties: {
          note_id: { type: "string", description: "要修改的笔记ID" },
          title: { type: "string", description: "新标题（可选）" },
          content: { type: "string", description: "新的笔记正文（Markdown，完整内容）" },
        },
        required: ["note_id", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_note",
      description: "删除一条笔记（用户要求删除某条笔记时使用）。",
      parameters: {
        type: "object",
        properties: { note_id: { type: "string", description: "要删除的笔记ID" } },
        required: ["note_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "finish",
      description: "完成所有检索后，调用此工具给出最终答案。在调用此工具之前，确保你已经充分检索了知识库。一旦调用此工具，对话轮次结束。",
      parameters: {
        type: "object",
        properties: {
          answer: { type: "string", description: "给用户的最终回答（支持 Markdown，可用 [n] 标注引用）" },
        },
        required: ["answer"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_time",
      description: "获取当前实时日期和时间。在需要判断时间相关性、搜索最新信息、或回答时间相关问题时使用。",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "搜索互联网获取最新信息。每次最多返回 2 条结果。可以多次调用不同关键词，但单次不要搜索太多。当知识库中没有相关内容，或用户问最新事件、实时数据时使用。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索查询词" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_scrape",
      description: "抓取指定网页 URL 的完整内容。当用户给出具体链接，或搜索结果中有需要深入了解的页面时使用。",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "要抓取的网页 URL" },
        },
        required: ["url"],
      },
    },
  },
];

/** 网络搜索相关工具名（可被前端开关整体关闭）。 */
export const WEB_TOOL_NAMES = new Set(["web_search", "web_scrape"]);

/** 返回工具定义列表。
 *  - webSearch=false 时剔除 web_search / web_scrape
 *  - Tavily 未配置（无 TAVILY_API_KEY）时强制剔除，无论开关 */
export function getToolDefs(opts: { webSearch?: boolean } = {}): ToolDef[] {
  const tavilyReady = !!process.env.TAVILY_API_KEY;
  const includeWeb = opts.webSearch === true && tavilyReady;
  return TOOL_DEFS.filter((t) => includeWeb || !WEB_TOOL_NAMES.has(t.function.name));
}

/** 执行一次工具调用。返回结果。 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  const fn = (tools as any)[name];
  if (!fn) throw new Error(`unknown tool: ${name}`);
  return fn(args || {}, ctx);
}

export const TOOL_NAMES = Object.keys(tools);

function toCitation(c: RetrievedChunk) {
  return {
    chunkId: c.chunkId, docId: c.docId, docTitle: c.docTitle,
    ordinal: c.ordinal, text: c.text.slice(0, 200), locator: c.locator, source: c.source,
  };
}
