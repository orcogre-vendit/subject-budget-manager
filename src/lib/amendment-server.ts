// 협약변경 — 장부에서 현재 편성·집행을 읽고, 새 협약변경의 시작 줄을 만든다 (서버 전용)
import "server-only";
import { prisma } from "@/lib/prisma";
import { allocationOf, spendingOf } from "@/lib/budget";
import { normalizeCategoryName } from "@/lib/budgetStandard";
import { lineKey, subKey, type AmendLine } from "@/lib/amendment";

export type LedgerState = {
  /** 장부 키(비목|세목|세세목) → 현재 편성(최초 편성 ± 조정)과 표시 이름 */
  alloc: Map<string, { itemName: string; subName: string | null; detailName: string | null; amount: number; sortOrder: number }>;
  spentBySub: Map<string, number>;
  spentByItem: Map<string, number>;
};

export async function loadLedgerState(projectYearId: string): Promise<LedgerState> {
  const txs = await prisma.transaction.findMany({
    where: { projectYearId, status: { not: "취소" } },
    select: {
      direction: true,
      amount: true,
      status: true,
      budgetAdjust: true,
      budgetItem: { select: { name: true, sortOrder: true } },
      budgetSubItem: { select: { name: true } },
      budgetDetailItem: { select: { name: true } },
    },
  });
  const alloc: LedgerState["alloc"] = new Map();
  const spentBySub = new Map<string, number>();
  const spentByItem = new Map<string, number>();
  for (const t of txs) {
    const item = t.budgetItem?.name ?? "(미분류)";
    const sub = t.budgetSubItem?.name ?? null;
    const detail = t.budgetDetailItem?.name ?? null;
    const a = allocationOf(t);
    if (a) {
      const k = lineKey(item, sub, detail);
      const cur = alloc.get(k) ?? { itemName: item, subName: sub, detailName: detail, amount: 0, sortOrder: t.budgetItem?.sortOrder ?? 99 };
      cur.amount += a;
      alloc.set(k, cur);
    }
    const s = spendingOf(t);
    if (s) {
      spentBySub.set(subKey(item, sub), (spentBySub.get(subKey(item, sub)) ?? 0) + s);
      spentByItem.set(normalizeCategoryName(item), (spentByItem.get(normalizeCategoryName(item)) ?? 0) + s);
    }
  }
  return { alloc, spentBySub, spentByItem };
}

/** 새 협약변경의 시작 줄 — 장부 현금 편성(0 이 아닌 것) + 직전 반영된 협약변경의 장부 밖 줄(현물·위탁 등) */
export async function prefillLines(projectYearId: string): Promise<Omit<AmendLine, "key">[]> {
  const { alloc } = await loadLedgerState(projectYearId);
  const ledger = [...alloc.values()]
    .filter((a) => a.amount !== 0)
    .sort((a, b) => a.sortOrder - b.sortOrder || (a.subName ?? "").localeCompare(b.subName ?? "", "ko") || (a.detailName ?? "").localeCompare(b.detailName ?? "", "ko"))
    .map((a) => ({
      itemName: a.itemName,
      subName: a.subName,
      detailName: a.detailName,
      fundType: "CASH" as const,
      inLedger: true,
      beforeAmt: a.amount,
      afterAmt: a.amount,
      note: null,
    }));

  const last = await prisma.budgetAmendment.findFirst({
    where: { projectYearId, status: "APPLIED" },
    orderBy: [{ effectiveDate: "desc" }, { appliedAt: "desc" }],
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  const offLedger = last
    ? last.lines
        .filter((l) => !l.inLedger)
        .map((l) => ({
          itemName: l.itemName,
          subName: l.subName,
          detailName: l.detailName,
          fundType: (l.fundType === "IN_KIND" ? "IN_KIND" : "CASH") as "CASH" | "IN_KIND",
          inLedger: false,
          beforeAmt: l.afterAmt,
          afterAmt: l.afterAmt,
          note: null,
        }))
    : [
        // 첫 협약변경: 장부에 없는 흔한 줄을 0 으로 깔아 둔다 (필요 없으면 지우면 됨)
        { itemName: "인건비", subName: "내부인건비(현물)", detailName: null, fundType: "IN_KIND" as const, inLedger: false, beforeAmt: 0, afterAmt: 0, note: null },
      ];
  return [...ledger, ...offLedger];
}
