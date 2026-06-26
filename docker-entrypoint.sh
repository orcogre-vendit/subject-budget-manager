#!/bin/sh
set -e

echo "[entrypoint] DB 마이그레이션 적용..."
node_modules/.bin/prisma migrate deploy

echo "[entrypoint] 기준정보(비목/세목/세세목) seed..."
node_modules/.bin/tsx prisma/seed.ts || echo "[entrypoint] seed 건너뜀"

echo "[entrypoint] Next.js 시작 (port ${PORT:-3000})..."
exec node_modules/.bin/next start -p "${PORT:-3000}"
