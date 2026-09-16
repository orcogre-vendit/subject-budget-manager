// RCMS 대조에 쓰는 Prisma include — 페이지/액션 공용
import type { Prisma } from "@/generated/prisma/client";

export const txInclude = {
  budgetItem: { select: { name: true } },
  budgetSubItem: { select: { name: true } },
  budgetDetailItem: { select: { name: true } },
} satisfies Prisma.TransactionInclude;

export const yearInclude = {
  project: { select: { id: true, name: true, code: true } },
  rcmsRecords: {
    include: { transaction: { include: txInclude } },
    orderBy: [{ useDate: "desc" as const }, { id: "desc" as const }],
  },
  transactions: { include: txInclude, orderBy: [{ date: "asc" as const }, { id: "asc" as const }] },
} satisfies Prisma.ProjectYearInclude;

export type YearForRcms = Prisma.ProjectYearGetPayload<{ include: typeof yearInclude }>;
