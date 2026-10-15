// 앱 전역 Prisma 싱글턴 — 연결 자체는 src/lib/db.ts (DSQL + IAM 토큰)
import { PrismaClient } from "@/generated/prisma/client";
import { createPrisma } from "@/lib/db";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrisma();

// Lambda 는 프로세스가 재사용되므로 production 에서도 전역에 보관해 연결 풀을 유지한다
globalForPrisma.prisma = prisma;
