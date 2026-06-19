import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db/client.js";
import { config } from "../config/index.js";
import { encrypt } from "../config/crypto.js";

/** bcrypt 哈希。 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** 极简 JWT（HS256）。避免引第三方 jose，payload 自管。 */
function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}
function b64urlDecode(s: string): string {
  return Buffer.from(s, "base64url").toString("utf8");
}

interface JwtPayload {
  sub: string; // user id
  email: string;
  exp: number;
}

function ttlSeconds(): number {
  const t = config.jwtTtl;
  const m = /^(\d+)([smhd])$/.exec(t.trim());
  if (!m) return 7 * 24 * 3600;
  const n = Number(m[1]);
  const unit: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return n * (unit[m[2]] || 86400);
}

export function signJwt(payload: { sub: string; email: string }): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body: JwtPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds() };
  const data = `${header}.${b64url(JSON.stringify(body))}`;
  const sig = crypto.createHmac("sha256", config.jwtSecret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyJwt(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [data, sig] = [parts.slice(0, 2).join("."), parts[2]];
  const expected = crypto.createHmac("sha256", config.jwtSecret).update(data).digest("base64url");
  // 定长比较防时序
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const body = JSON.parse(b64urlDecode(parts[1])) as JwtPayload;
    if (body.exp * 1000 < Date.now()) return null;
    return body;
  } catch {
    return null;
  }
}

// ---- 用户仓储 ----
export async function createUser(email: string, password: string) {
  const db = getDb();
  const [u] = await db
    .insert(schema.users)
    .values({ email: email.toLowerCase().trim(), passwordHash: await hashPassword(password) })
    .returning();
  return u;
}

export async function findUserByEmail(email: string) {
  const db = getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase().trim())).limit(1);
  return u || null;
}

export async function findUserById(id: string) {
  const db = getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  return u || null;
}

/** 绑定/更新用户 Chat 配置（BYOK：key + endpoint + model）。 */
export async function setUserChatConfig(userId: string, opts: {
  apiKey?: string;
  baseUrl?: string;
  chatModel?: string;
}) {
  const db = getDb();
  const patch: Record<string, string | null> = {};
  if (opts.apiKey !== undefined) {
    const enc = encrypt(opts.apiKey.trim());
    patch.chatApiKeyEnc = enc;
    patch.newapiKeyEnc = enc; // 向后兼容
  }
  if (opts.baseUrl !== undefined) patch.chatBaseUrl = opts.baseUrl.trim() || null;
  if (opts.chatModel !== undefined) patch.chatModel = opts.chatModel;
  if (Object.keys(patch).length === 0) return;
  await db.update(schema.users).set(patch).where(eq(schema.users.id, userId));
}

export async function setUserModels(userId: string, chatModel?: string, embeddingModel?: string) {
  const db = getDb();
  const patch: Record<string, string> = {};
  if (chatModel) patch.chatModel = chatModel;
  if (embeddingModel) patch.embeddingModel = embeddingModel;
  if (Object.keys(patch).length === 0) return;
  await db.update(schema.users).set(patch).where(eq(schema.users.id, userId));
}
