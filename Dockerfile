# ===== 多阶段构建 =====
# Stage 1: 构建前端
FROM node:20-slim AS web-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev=false
COPY web/ ./web/
COPY web/vite.config.ts ./web/vite.config.ts
# 前端构建（vite.config.ts 已在 web/ 内）
RUN npx vite build --config web/vite.config.ts

# Stage 2: 构建 + 运行后端
FROM node:20-slim AS app
WORKDIR /app

# 系统依赖（sharp 需要）
RUN apt-get update && apt-get install -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 复制后端代码
COPY server/ ./server/
COPY tsconfig.json ./

# 复制前端构建产物
COPY --from=web-builder /app/web/dist ./web/dist

# 数据目录
RUN mkdir -p data/uploads data/chunks

# 迁移文件已包含在 server/migrations
EXPOSE 8787

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# 默认启动 API（worker 用相同镜像，command 覆盖）
CMD ["npx", "tsx", "server/src/index.ts"]
