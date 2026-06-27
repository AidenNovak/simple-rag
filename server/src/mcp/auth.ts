/**
 * MCP API token 鉴权。
 *
 * 三大 harness（Claude Code/Codex/Cursor）是后端长驻进程，无浏览器会话，
 * 故不用 JWT，改用专用 token。明文 token 仅创建时返回一次，DB 只存 SHA-256 哈希。
 *
 * 隔离：token → user_id 强绑定。解出 userId 后透传给检索层，所有查询 WHERE user_id。
 *
 * 边界：token 只用于身份认证，不是 UserChatCreds。MCP 检索走系统 embedding key。
 */
import crypto from "node:crypto";
import { getDb, schema } from "../db/client.js";
import { eq, and, isNull } from "drizzle-orm";

/** 生成 32 字节随机 token，返回 hex（64 字符）。 */
function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * 为 userId 生成一个 MCP token。明文 token 仅在此返回一次。
 * DB 只存 SHA-256 哈希。
 */
export async function createMcpToken(
  userId: string,
  label?: string
): Promise<{ tokenId: string; plaintext: string }> {
  const plaintext = generateToken();
  const tokenHash = hashToken(plaintext);
  const db = getDb();
  const [row] = await db
    .insert(schema.mcpTokens)
    .values({ userId, tokenHash, label })
    .returning({ id: schema.mcpTokens.id });
  return { tokenId: row.id, plaintext };
}

/**
 * 解析 token → userId。有效（未吊销）返回 userId，否则返回 null。
 * 成功时非阻塞更新 last_used_at（失败不影响鉴权）。
 *
 * 不区分「不存在」vs「已吊销」—— 统一返回 null，防信息泄漏。
 */
export async function resolveTokenUser(token: string): Promise<string | null> {
  // 格式校验：必须是 64 位 hex，否则直接拒绝（避免无谓哈希计算与 DB 查询）
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = hashToken(token);
  const db = getDb();
  const [row] = await db
    .select({ userId: schema.mcpTokens.userId })
    .from(schema.mcpTokens)
    .where(
      and(
        eq(schema.mcpTokens.tokenHash, tokenHash),
        isNull(schema.mcpTokens.revokedAt)
      )
    )
    .limit(1);
  if (!row) return null;
  // 非阻塞更新最后使用时间（不 await，失败不影响鉴权结果）
  db.update(schema.mcpTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.mcpTokens.tokenHash, tokenHash))
    .execute()
    .catch(() => {});
  return row.userId;
}

/** 吊销 token（软删除）。按 userId + 明文 token 定位，防越权吊销他人 token。 */
export async function revokeToken(userId: string, plaintext: string): Promise<void> {
  const tokenHash = hashToken(plaintext);
  const db = getDb();
  await db
    .update(schema.mcpTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(schema.mcpTokens.tokenHash, tokenHash),
        eq(schema.mcpTokens.userId, userId)
      )
    );
}

/** 列出 userId 的所有未吊销 token（不含明文，明文已无法恢复）。 */
export async function listTokens(userId: string) {
  const db = getDb();
  return db
    .select({
      id: schema.mcpTokens.id,
      label: schema.mcpTokens.label,
      createdAt: schema.mcpTokens.createdAt,
      lastUsedAt: schema.mcpTokens.lastUsedAt,
    })
    .from(schema.mcpTokens)
    .where(
      and(
        eq(schema.mcpTokens.userId, userId),
        isNull(schema.mcpTokens.revokedAt)
      )
    );
}

export { hashToken };
