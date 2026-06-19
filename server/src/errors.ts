/**
 * 统一错误类型层级。
 *
 * 用法：throw new ValidationError("标题不能为空")
 * 全局错误处理器（index.ts）自动映射到正确的 HTTP 状态码。
 * 路由中不再需要手动 reply.code(400).send(...)。
 */

export class AppError extends Error {
  constructor(
    message: string,
    public status: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** 400 客户端输入错误 */
export class ValidationError extends AppError {
  constructor(message: string) { super(message, 400, "VALIDATION_ERROR"); }
}

/** 401 未认证 */
export class AuthError extends AppError {
  constructor(message: string = "请先登录") { super(message, 401, "AUTH_ERROR"); }
}

/** 403 无权访问 */
export class ForbiddenError extends AppError {
  constructor(message: string = "无权访问") { super(message, 403, "FORBIDDEN"); }
}

/** 404 资源不存在 */
export class NotFoundError extends AppError {
  constructor(resource: string = "资源") { super(`${resource}不存在`, 404, "NOT_FOUND"); }
}

/** 409 冲突（如重复注册） */
export class ConflictError extends AppError {
  constructor(message: string) { super(message, 409, "CONFLICT"); }
}

/** 429 限流 */
export class RateLimitError extends AppError {
  constructor(message: string = "请求过于频繁") { super(message, 429, "RATE_LIMIT"); }
}

/** 502 上游服务错误（LLM/embedding 调用失败） */
export class UpstreamError extends AppError {
  constructor(message: string) { super(message, 502, "UPSTREAM_ERROR"); }
}

/** 判断是否为 AppError（全局处理器用）。 */
export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
