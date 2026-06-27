import type { FastifyInstance } from "fastify";
import { authGuard, requireUser, type AuthedRequest } from "../auth/middleware.js";
import { agentAnswer, agentAnswerStream, generateTitle, generateFollowUps, type ContextNote } from "../rag/agent.js";
import { getDb, schema } from "../db/client.js";
import { and, eq, inArray } from "drizzle-orm";
import { ValidationError } from "../errors.js";
import * as convoService from "../services/conversation.js";
import { config } from "../config/index.js";

/**
 * 问答 / 对话路由。
 * 业务逻辑在 ConversationService，路由仅做传输 + 鉴权 + 调 agent。
 */

/** 加载工作台选定的多篇参考笔记作为对话上下文（强制 user_id 隔离，防 IDOR）。 */
async function loadContextNotes(userId: string, docIds?: string[]): Promise<ContextNote[] | undefined> {
  if (!docIds || docIds.length === 0) return undefined;
  const db = getDb();
  const docs = await db.select().from(schema.documents)
    .where(and(inArray(schema.documents.id, docIds), eq(schema.documents.userId, userId)));
  if (docs.length === 0) return undefined;
  return docs.map((d) => ({ id: d.id, title: d.title, content: d.contentMd || "" }));
}

/** 规范化 selection：接受 D2 对象 { docId, text, start?, end? } 或纯字符串，统一返回 text。 */
function normalizeSelection(sel: unknown): string | undefined {
  if (!sel) return undefined;
  if (typeof sel === "string") return sel;
  if (typeof sel === "object" && sel !== null) {
    const t = (sel as any).text;
    if (typeof t === "string" && t.trim()) return t;
  }
  return undefined;
}

export async function chatRoutes(app: FastifyInstance) {

  // ---- 单轮问答 ----
  app.post("/chat/ask", { preHandler: [authGuard] }, async (req: AuthedRequest, reply) => {
    const user = requireUser(req);
    const body = (req.body || {}) as { question?: string; conversationId?: string; webSearch?: boolean; contextDocIds?: string[]; selection?: unknown };
    if (!body.question?.trim()) throw new ValidationError("问题不能为空");
    if (body.question.length > config.tuning.questionMaxLen) throw new ValidationError(`问题过长（上限 ${config.tuning.questionMaxLen} 字符）`);

    const creds = { chatApiKeyEnc: (user as any).chatApiKeyEnc || user.newapiKeyEnc, chatModel: user.chatModel, chatBaseUrl: (user as any).chatBaseUrl };
    // 提前解析会话（复用 scopeDocIds + convId，避免重复调用）
    const convo = body.conversationId
      ? await convoService.getOrCreateConversation(user.id, body.conversationId, body.question)
      : null;
    const scopeDocIds = convo?.scopeDocIds ?? null;
    const history = await convoService.loadHistory(user.id, body.conversationId);
    const contextNotes = await loadContextNotes(user.id, body.contextDocIds);
    const selection = normalizeSelection(body.selection);
    const result = await agentAnswer(user.id, body.question, creds, history, scopeDocIds, body.webSearch === true, contextNotes, selection, convo?.id);

    // 落库（业务逻辑在 service 层）
    const { id: convId, isNew } = convo ?? await convoService.getOrCreateConversation(user.id, body.conversationId, body.question);
    const { messageId } = await convoService.appendTurn(convId, user.id, {
      question: body.question,
      answer: result.answer,
      citations: result.citations,
      usage: { ...(result.usage as any), toolCalls: result.toolCalls },
    });

    // 新对话：异步生成标题
    if (isNew) {
      generateTitle(body.question, result.answer, creds).then(async (title) => {
        if (title) await convoService.renameConversation(user.id, convId, title).catch(() => {});
      }).catch(() => {});
    }

    // 生成后续建议（同步等待，chips 需随响应返回）
    let followUps: string[] = [];
    try { followUps = await generateFollowUps(body.question, result.answer, creds); } catch { /* ignore */ }

    reply.send({ answer: result.answer, citations: result.citations, toolCalls: result.toolCalls, usage: result.usage, followUps, conversationId: convId, messageId });
  });

  // ---- 流式问答（SSE，逐 token）----
  // 并发控制：同一用户只能有一个活跃流
  const activeStreams = new Map<string, boolean>();
  app.post("/chat/stream", { preHandler: [authGuard] }, async (req: AuthedRequest, reply) => {
    const user = requireUser(req);
    const body = (req.body || {}) as { question?: string; conversationId?: string; webSearch?: boolean; contextDocIds?: string[]; selection?: unknown };
    if (!body.question?.trim()) throw new ValidationError("问题不能为空");
    if (body.question.length > config.tuning.questionMaxLen) throw new ValidationError(`问题过长（上限 ${config.tuning.questionMaxLen} 字符）`);
    // 工作台上下文：提前加载（并发控制之前，避免误计数）
    const contextNotes = await loadContextNotes(user.id, body.contextDocIds);
    const selection = normalizeSelection(body.selection);
    // 并发控制
    if (activeStreams.get(user.id)) {
      return reply.code(429).send({ error: "上一个回答还在生成中，请等待完成或停止后再试" });
    }

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no"); // Nginx: 禁用 buffer
    reply.raw.flushHeaders?.();

    const creds = { chatApiKeyEnc: (user as any).chatApiKeyEnc || user.newapiKeyEnc, chatModel: user.chatModel, chatBaseUrl: (user as any).chatBaseUrl };
    activeStreams.set(user.id, true);

    // AbortController：客户端断开时中止所有上游请求
    const ac = new AbortController();
    const abortTimeout = setTimeout(() => ac.abort(), 180_000); // 3 分钟总超时
    req.raw.on("close", () => { ac.abort(); });

    // SSE 心跳：每 15 秒发一个注释行，防止 Nginx/Cloudflare 因空闲超时关闭连接
    const heartbeat = setInterval(() => {
      if (!reply.raw.destroyed) reply.raw.write(`: heartbeat\n\n`);
    }, 15_000);

    try {
      const convo = body.conversationId
        ? await convoService.getOrCreateConversation(user.id, body.conversationId, body.question)
        : null;
      const scopeDocIds = convo?.scopeDocIds ?? null;
      const history = await convoService.loadHistory(user.id, body.conversationId);
      const gen = agentAnswerStream(user.id, body.question, creds, history, scopeDocIds, body.webSearch === true, contextNotes, selection, convo?.id);
      let fullAnswer = "";
      let finalCitations: any[] = [];
      let finalToolCalls: any[] = [];
      let finalUsage: unknown = null;
      let streamedAnswer = ""; // 累积已发送的 delta（用于断线时持久化部分答案）

      for await (const evt of gen) {
        if (ac.signal.aborted) break;
        switch (evt.type) {
          case "delta":
            streamedAnswer += evt.content;
            reply.raw.write(`data: ${JSON.stringify({ delta: evt.content })}\n\n`);
            break;
          case "citations":
            finalCitations = evt.citations;
            reply.raw.write(`event: citations\ndata: ${JSON.stringify(evt.citations)}\n\n`);
            break;
          case "toolCalls":
            finalToolCalls = evt.toolCalls;
            reply.raw.write(`event: toolCalls\ndata: ${JSON.stringify(evt.toolCalls)}\n\n`);
            break;
          case "reasoning":
            reply.raw.write(`event: reasoning\ndata: ${JSON.stringify({ content: evt.content })}\n\n`);
            break;
          case "doc_patch":
            reply.raw.write(`event: doc_patch\ndata: ${JSON.stringify(evt)}\n\n`);
            break;
          case "done":
            fullAnswer = evt.answer || streamedAnswer;
            finalCitations = evt.citations;
            finalToolCalls = evt.toolCalls;
            finalUsage = evt.usage;
            break;
          case "error":
            reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: evt.message })}\n\n`);
            break;
        }
      }

      // 落库（即使中断也尝试保存部分答案）
      const answerToSave = fullAnswer || (streamedAnswer.length > 20 ? streamedAnswer + "\n\n⚠️（回答被中断）" : "");
      if (answerToSave) {
        const { id: convId, isNew } = await convoService.getOrCreateConversation(user.id, body.conversationId, body.question);
        await convoService.appendTurn(convId, user.id, {
          question: body.question, answer: answerToSave,
          citations: finalCitations, usage: { ...(finalUsage as any), toolCalls: finalToolCalls },
        });
        if (isNew) {
          generateTitle(body.question, answerToSave, creds).then(async (title) => {
            if (title) await convoService.renameConversation(user.id, convId, title).catch(() => {});
          }).catch(() => {});
        }
        let followUps: string[] = [];
        if (fullAnswer) {
          try { followUps = await generateFollowUps(body.question, fullAnswer, creds); } catch { /* ignore */ }
        }
        reply.raw.write(`event: done\ndata: ${JSON.stringify({ conversationId: convId, usage: finalUsage, followUps })}\n\n`);
      }
    } catch (e) {
      if (!reply.raw.destroyed) {
        reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: (e as Error).message })}\n\n`);
      }
    } finally {
      clearInterval(heartbeat);
      clearTimeout(abortTimeout);
      activeStreams.delete(user.id);
      if (!reply.raw.destroyed) reply.raw.end();
    }
  });

  // ---- 会话 CRUD（全部委托 ConversationService）----
  app.get("/conversations", { preHandler: [authGuard] }, async (req: AuthedRequest) => {
    const user = requireUser(req);
    return { conversations: await convoService.listConversations(user.id) };
  });

  app.post("/conversations", { preHandler: [authGuard] }, async (req: AuthedRequest) => {
    const user = requireUser(req);
    const body = (req.body || {}) as { title?: string };
    const { id } = await convoService.getOrCreateConversation(user.id, undefined, body.title || "新会话");
    const db = getDb();
    const [conv] = await db.select().from(schema.conversations).where(eq(schema.conversations.id, id)).limit(1);
    return { conversation: conv };
  });

  app.get("/conversations/:id/messages", { preHandler: [authGuard] }, async (req: AuthedRequest) => {
    const user = requireUser(req);
    const id = (req.params as { id: string }).id;
    return { messages: await convoService.getMessages(user.id, id) };
  });

  app.patch("/conversations/:id", { preHandler: [authGuard] }, async (req: AuthedRequest) => {
    const user = requireUser(req);
    const id = (req.params as { id: string }).id;
    const body = (req.body || {}) as { title?: string; scopeDocIds?: string[] | null };
    if (body.scopeDocIds !== undefined) {
      await convoService.setConversationScope(user.id, id, body.scopeDocIds);
    }
    if (body.title?.trim()) {
      await convoService.renameConversation(user.id, id, body.title);
    }
    const db = getDb();
    const [conv] = await db.select().from(schema.conversations).where(eq(schema.conversations.id, id)).limit(1);
    return { conversation: conv };
  });

  app.delete("/conversations/:id", { preHandler: [authGuard] }, async (req: AuthedRequest) => {
    const user = requireUser(req);
    const id = (req.params as { id: string }).id;
    await convoService.deleteConversation(user.id, id);
    return { ok: true };
  });
}
