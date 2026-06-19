import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyJwt, findUserById } from "./jwt.js";
import type { User } from "../db/schema.js";

export interface AuthedRequest extends FastifyRequest {
  user?: User;
}

/** Fastify preHandler：从 Authorization: Bearer <jwt> 解出 user 挂到 req.user。 */
export async function authGuard(req: AuthedRequest, reply: FastifyReply): Promise<void> {
  const auth = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) {
    reply.code(401).send({ error: "missing token" });
    return;
  }
  const payload = verifyJwt(m[1]);
  if (!payload) {
    reply.code(401).send({ error: "invalid or expired token" });
    return;
  }
  const user = await findUserById(payload.sub);
  if (!user) {
    reply.code(401).send({ error: "user not found" });
    return;
  }
  req.user = user;
}

/** 类型守卫：确保经过 authGuard 后有 user。 */
export function requireUser(req: AuthedRequest): User {
  if (!req.user) throw new Error("auth required");
  return req.user;
}
