# ---- builder ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# better-sqlite3 네이티브 빌드용 도구 (prebuild 없을 때 대비)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
ENV DATABASE_URL="file:/app/data/app.db"
RUN npx prisma generate
RUN npm run build

# ---- runner ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV DATABASE_URL="file:/app/data/app.db"
ENV UPLOAD_DIR="/app/uploads"
ENV PORT=3000

# 런타임에 필요한 산출물만 복사 (마이그레이션/시드 위해 prisma CLI 포함된 node_modules 사용)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/package.json ./package.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh && mkdir -p /app/data /app/uploads

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
