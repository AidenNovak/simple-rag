import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createUser, findUserByEmail, verifyPassword, signJwt, setUserChatConfig, setUserModels } from "../auth/jwt.js";
import { authGuard, requireUser, type AuthedRequest } from "../auth/middleware.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/register", async (req: AuthedRequest, reply) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = Object.values(parsed.error.flatten().fieldErrors).flat()[0] || "输入无效";
      return reply.code(400).send({ error: msg });
    }
    const { email, password } = parsed.data;
    const existing = await findUserByEmail(email);
    if (existing) return reply.code(409).send({ error: "该邮箱已注册" });
    const user = await createUser(email, password);
    const token = signJwt({ sub: user.id, email: user.email });
    reply.send({ token, user: safeUser(user) });
  });

  app.post("/auth/login", async (req: AuthedRequest, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = Object.values(parsed.error.flatten().fieldErrors).flat()[0] || "输入无效";
      return reply.code(400).send({ error: msg });
    }
    const { email, password } = parsed.data;
    const user = await findUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return reply.code(401).send({ error: "invalid credentials" });
    }
    const token = signJwt({ sub: user.id, email: user.email });
    reply.send({ token, user: safeUser(user) });
  });

  app.get("/auth/me", { preHandler: authGuard }, async (req: AuthedRequest, reply) => {
    reply.send({ user: safeUser(requireUser(req)) });
  });

  // BYOK：绑定用户自己的 Chat API Key + 自定义 endpoint（调用按此计费）
  app.post("/auth/chat-config", { preHandler: authGuard }, async (req: AuthedRequest, reply) => {
    const body = z.object({
      apiKey: z.string().optional(),
      baseUrl: z.string().optional(),
      chatModel: z.string().optional(),
    }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "参数无效" });
    const user = requireUser(req);
    await setUserChatConfig(user.id, body.data);
    reply.send({ ok: true });
  });

  // 兼容旧端点（仅设置 key）
  app.post("/auth/newapi-key", { preHandler: authGuard }, async (req: AuthedRequest, reply) => {
    const body = z.object({ apiKey: z.string().min(1) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "apiKey required" });
    const user = requireUser(req);
    await setUserChatConfig(user.id, { apiKey: body.data.apiKey });
    reply.send({ ok: true });
  });

  // 设置用户偏好的模型
  app.post("/auth/models", { preHandler: authGuard }, async (req: AuthedRequest, reply) => {
    const body = z.object({ chatModel: z.string().optional(), embeddingModel: z.string().optional() }).safeParse(req.body);
    if (!body.success) {
      const msg = Object.values(body.error.flatten().fieldErrors).flat()[0] || "参数无效";
      return reply.code(400).send({ error: msg });
    }
    const user = requireUser(req);
    await setUserModels(user.id, body.data.chatModel, body.data.embeddingModel);
    reply.send({ ok: true });
  });
}

function safeUser(u: any) {
  return {
    id: u.id,
    email: u.email,
    hasNewapiKey: !!(u.chatApiKeyEnc || u.newapiKeyEnc),
    chatBaseUrl: u.chatBaseUrl || null,
    chatModel: u.chatModel,
    embeddingModel: u.embeddingModel,
  };
}
