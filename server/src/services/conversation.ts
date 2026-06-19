/**
 * ConversationService — 会话 + 消息的业务逻辑层。
 *
 * 从 routes/chat.ts 抽取，消除路由内的 DB 逻辑重复。
 * 所有方法强制 userId 过滤（多租户隔离）。
 */
import { and, asc, eq, desc } from "drizzle-orm";
import { getDb, schema } from "../db/client.js";
import { NotFoundError, ForbiddenError } from "../errors.js";

/** 加载会话历史（仅 user/assistant 消息）。 */
export async function loadHistory(
  userId: string,
  conversationId: string | undefined
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  if (!conversationId) return [];
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.messages)
    .where(and(eq(schema.messages.conversationId, conversationId), eq(schema.messages.userId, userId)))
    .orderBy(asc(schema.messages.createdAt));
  return rows
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
}

/** 验证会话归属（防 IDOR）。 */
export async function verifyOwnership(userId: string, conversationId: string): Promise<boolean> {
  const db = getDb();
  const [conv] = await db
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(and(eq(schema.conversations.id, conversationId), eq(schema.conversations.userId, userId)))
    .limit(1);
  return !!conv;
}

/** 获取或创建会话。返回 { id, isNew, scopeDocIds }。 */
export async function getOrCreateConversation(
  userId: string,
  conversationId: string | undefined,
  fallbackTitle: string
): Promise<{ id: string; isNew: boolean; scopeDocIds?: string[] | null }> {
  const db = getDb();
  if (conversationId) {
    const [conv] = await db
      .select()
      .from(schema.conversations)
      .where(and(eq(schema.conversations.id, conversationId), eq(schema.conversations.userId, userId)))
      .limit(1);
    if (!conv) throw new ForbiddenError("无权访问该会话");
    return { id: conversationId, isNew: false, scopeDocIds: conv.scopeDocIds as string[] | null };
  }
  const [conv] = await db
    .insert(schema.conversations)
    .values({ userId, title: fallbackTitle.slice(0, 40) })
    .returning();
  return { id: conv.id, isNew: true, scopeDocIds: null };
}

/** 更新会话的文档范围。 */
export async function setConversationScope(userId: string, conversationId: string, docIds: string[] | null): Promise<void> {
  const db = getDb();
  const [updated] = await db
    .update(schema.conversations)
    .set({ scopeDocIds: docIds })
    .where(and(eq(schema.conversations.id, conversationId), eq(schema.conversations.userId, userId)))
    .returning();
  if (!updated) throw new NotFoundError("会话");
}

/** 追加一轮问答（user 消息 + assistant 消息）。 */
export async function appendTurn(
  conversationId: string,
  userId: string,
  data: {
    question: string;
    answer: string;
    citations?: unknown;
    usage?: unknown;
  }
): Promise<{ messageId: string }> {
  const db = getDb();
  await db.insert(schema.messages).values({
    conversationId, userId, role: "user", content: data.question,
  });
  const [msg] = await db
    .insert(schema.messages)
    .values({
      conversationId, userId, role: "assistant",
      content: data.answer, citations: data.citations as any, usage: data.usage as any,
    })
    .returning();
  return { messageId: msg.id };
}

/** 更新会话标题。 */
export async function renameConversation(userId: string, conversationId: string, title: string): Promise<void> {
  const db = getDb();
  const [updated] = await db
    .update(schema.conversations)
    .set({ title: title.trim() })
    .where(and(eq(schema.conversations.id, conversationId), eq(schema.conversations.userId, userId)))
    .returning();
  if (!updated) throw new NotFoundError("会话");
}

/** 删除会话（级联删消息）。 */
export async function deleteConversation(userId: string, conversationId: string): Promise<void> {
  const db = getDb();
  const [deleted] = await db
    .delete(schema.conversations)
    .where(and(eq(schema.conversations.id, conversationId), eq(schema.conversations.userId, userId)))
    .returning();
  if (!deleted) throw new NotFoundError("会话");
}

/** 列出用户的所有会话。 */
export async function listConversations(userId: string) {
  const db = getDb();
  return db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.userId, userId))
    .orderBy(desc(schema.conversations.createdAt));
}

/** 获取会话消息（含所有权校验）。 */
export async function getMessages(userId: string, conversationId: string) {
  if (!(await verifyOwnership(userId, conversationId))) {
    throw new NotFoundError("会话");
  }
  const db = getDb();
  return db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(asc(schema.messages.createdAt));
}
