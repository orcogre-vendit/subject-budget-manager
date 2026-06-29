"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { FormState } from "@/app/projects/actions";

export async function createBudgetItem(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const name = ((fd.get("name") as string | null) ?? "").trim();
  if (!name) return { fieldErrors: { name: "비목명을 입력하세요." } };

  try {
    const max = await prisma.budgetItem.aggregate({ _max: { sortOrder: true } });
    await prisma.budgetItem.create({
      data: { name, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return { fieldErrors: { name: "이미 있는 비목입니다." } };
    throw e;
  }
  revalidatePath("/budget");
  return { values: {} };
}

/** 세목/세세목이 없는(거래에 미사용) 비목만 삭제 */
export async function deleteBudgetItem(fd: FormData): Promise<void> {
  const id = Number(fd.get("id"));
  if (!id) return;
  const [subCount, txCount] = await Promise.all([
    prisma.budgetSubItem.count({ where: { budgetItemId: id } }),
    prisma.transaction.count({ where: { budgetItemId: id } }),
  ]);
  if (subCount > 0 || txCount > 0) return; // 사용 중이면 삭제 안 함
  await prisma.budgetItem.delete({ where: { id } });
  revalidatePath("/budget");
}
