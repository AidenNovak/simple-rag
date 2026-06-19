import crypto from "node:crypto";
import { config } from "./index.js";

const ALGO = "aes-256-gcm";

function keyBytes(): Buffer {
  // 派生固定 32 字节密钥（任意长度输入 → 32B via sha256）
  return crypto.createHash("sha256").update(config.encKey).digest();
}

/** 对称加密用户 Chat API key（数据库落库前）。返回 base64(iv|ct|tag)。 */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, keyBytes(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]).toString("base64");
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(buf.length - 16);
  const ct = buf.subarray(12, buf.length - 16);
  const decipher = crypto.createDecipheriv(ALGO, keyBytes(), iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plain.toString("utf8");
}

/** 随机 token（api key 风格）。 */
export function randomToken(len = 32): string {
  return crypto.randomBytes(len).toString("hex");
}

/** sha256 摘要（用于幂等去重 key 等）。 */
export function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}
