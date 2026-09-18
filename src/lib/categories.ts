// 비목·세목·세세목 찾기/등록 — 이름을 normalizeCategoryName 으로 비교해 "연구실 운영비"/"연구실운영비" 같은
// 띄어쓰기·가운뎃점 차이로 중복 항목이 생기지 않게 한다. 원장 입력(find-or-create)·RCMS 가져오기·seed 가 함께 쓴다.
// seed(tsx)에서도 부르므로 경로 별칭(@/) 대신 상대 경로로 import 한다.
import type { PrismaClient } from "../generated/prisma/client";
import { normalizeCategoryName } from "./budgetStandard";

type Db = Pick<PrismaClient, "budgetItem" | "budgetSubItem" | "budgetDetailItem">;
export type CategoryRow = { id: number; name: string };

const pick = (rows: CategoryRow[], name: string): CategoryRow | null => {
  const key = normalizeCategoryName(name);
  return rows.find((r) => normalizeCategoryName(r.name) === key) ?? null;
};

export async function findItem(db: Db, name: string): Promise<CategoryRow | null> {
  const rows = await db.budgetItem.findMany({ select: { id: true, name: true } });
  return pick(rows, name);
}

export async function findOrCreateItem(db: Db, name: string, sortOrder = 99): Promise<CategoryRow> {
  const hit = await findItem(db, name);
  if (hit) return hit;
  return db.budgetItem.create({ data: { name: name.trim(), sortOrder }, select: { id: true, name: true } });
}

export async function findSub(db: Db, budgetItemId: number, name: string): Promise<CategoryRow | null> {
  const rows = await db.budgetSubItem.findMany({ where: { budgetItemId }, select: { id: true, name: true } });
  return pick(rows, name);
}

export async function findOrCreateSub(db: Db, budgetItemId: number, name: string): Promise<CategoryRow> {
  const hit = await findSub(db, budgetItemId, name);
  if (hit) return hit;
  return db.budgetSubItem.create({ data: { budgetItemId, name: name.trim() }, select: { id: true, name: true } });
}

export async function findDetail(db: Db, budgetSubItemId: number, name: string): Promise<CategoryRow | null> {
  const rows = await db.budgetDetailItem.findMany({ where: { budgetSubItemId }, select: { id: true, name: true } });
  return pick(rows, name);
}

export async function findOrCreateDetail(db: Db, budgetSubItemId: number, name: string): Promise<CategoryRow> {
  const hit = await findDetail(db, budgetSubItemId, name);
  if (hit) return hit;
  return db.budgetDetailItem.create({ data: { budgetSubItemId, name: name.trim() }, select: { id: true, name: true } });
}

/** 비목 id 아래로 세목·세세목 이름을 찾거나 등록해 id 묶음으로 */
export async function resolveSubAndDetail(
  db: Db,
  budgetItemId: number | null,
  subName: string | null | undefined,
  detailName: string | null | undefined,
): Promise<{ budgetItemId: number | null; budgetSubItemId: number | null; budgetDetailItemId: number | null }> {
  if (!budgetItemId || !subName?.trim()) return { budgetItemId, budgetSubItemId: null, budgetDetailItemId: null };
  const sub = await findOrCreateSub(db, budgetItemId, subName);
  const detail = detailName?.trim() ? await findOrCreateDetail(db, sub.id, detailName) : null;
  return { budgetItemId, budgetSubItemId: sub.id, budgetDetailItemId: detail?.id ?? null };
}
