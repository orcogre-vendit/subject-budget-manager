"use server";

// 협약변경 — 작성(초안 저장) → 반영(장부에 조정 레코드 추가) → 필요하면 반영 취소(그 레코드만 삭제).
// 원 편성 레코드는 절대 고치지 않는다 (복식부기식).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { idOf } from "@/lib/ids";
import { lineKey, review, type AmendLine } from "@/lib/amendment";
import { loadLedgerState, prefillLines } from "@/lib/amendment-server";
import { findOrCreateDetail, findOrCreateItem, findOrCreateSub } from "@/lib/categories";
import { nextSeqNo } from "@/lib/seq";
import { sameCategoryName } from "@/lib/budgetStandard";

export type ActResult = { ok: true; text?: string } | { ok: false; error: string };

const fmt = (v: number) => v.toLocaleString("ko-KR");

async function yearOf(projectYearId: string) {
  return prisma.projectYear.findUnique({ where: { id: projectYearId }, select: { id: true, projectId: true } });
}
function paths(projectId: string, yearId: string, amendmentId?: string) {
  revalidatePath(`/projects/${projectId}/years/${yearId}/amendments`);
  if (amendmentId) revalidatePath(`/projects/${projectId}/years/${yearId}/amendments/${amendmentId}`);
  revalidatePath(`/projects/${projectId}/years/${yearId}/ledger`);
  revalidatePath(`/projects/${projectId}/years/${yearId}/budget`);
  revalidatePath("/budgets");
  revalidatePath("/researchers/participation");
}

/** 새 협약변경 초안 — 현재 편성으로 채워서 만들고 편집 화면으로 */
export async function createAmendment(fd: FormData): Promise<void> {
  const projectYearId = idOf(fd.get("projectYearId"));
  if (!projectYearId) return;
  const year = await yearOf(projectYearId);
  if (!year) return;
  const lines = await prefillLines(projectYearId);
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const a = await prisma.budgetAmendment.create({
    data: {
      projectYearId,
      title: `${ymd} 협약변경`,
      effectiveDate: new Date(ymd),
      lines: { create: lines.map((l, i) => ({ ...l, inLedger: l.inLedger || null, sortOrder: i })) },
    },
  });
  paths(year.projectId, projectYearId, a.id);
  redirect(`/projects/${year.projectId}/years/${projectYearId}/amendments/${a.id}`);
}

type SaveInput = {
  amendmentId: string;
  title: string;
  effectiveDate: string;
  reason: string;
  lines: Omit<AmendLine, "key">[];
};

export async function saveAmendment(input: SaveInput): Promise<ActResult> {
  const id = idOf(input.amendmentId);
  if (!id) return { ok: false, error: "잘못된 협약변경입니다." };
  const a = await prisma.budgetAmendment.findUnique({ where: { id }, select: { status: true, projectYearId: true, projectYear: { select: { projectId: true } } } });
  if (!a) return { ok: false, error: "협약변경을 찾을 수 없습니다." };
  if (a.status !== "DRAFT") return { ok: false, error: "반영된 협약변경은 고칠 수 없습니다. 반영 취소 후 고치세요." };
  if (!input.title.trim()) return { ok: false, error: "제목을 넣으세요." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate)) return { ok: false, error: "변경 기준일을 넣으세요." };
  for (const [i, l] of input.lines.entries()) {
    if (!l.itemName?.trim()) return { ok: false, error: `${i + 1}번째 줄: 비목을 넣으세요.` };
    if (!Number.isInteger(l.beforeAmt) || !Number.isInteger(l.afterAmt) || l.beforeAmt < 0 || l.afterAmt < 0)
      return { ok: false, error: `${i + 1}번째 줄: 금액은 0 이상의 정수(원)여야 합니다.` };
    if (l.fundType !== "CASH" && l.fundType !== "IN_KIND") return { ok: false, error: `${i + 1}번째 줄: 현금/현물을 고르세요.` };
    if (l.inLedger && l.fundType !== "CASH") return { ok: false, error: `${i + 1}번째 줄: 현물은 장부에 반영할 수 없습니다.` };
  }
  await prisma.$transaction([
    prisma.budgetAmendmentLine.deleteMany({ where: { amendmentId: id } }),
    prisma.budgetAmendmentLine.createMany({
      data: input.lines.map((l, i) => ({
        amendmentId: id,
        itemName: l.itemName.trim(),
        subName: l.subName?.trim() || null,
        detailName: l.detailName?.trim() || null,
        fundType: l.fundType,
        inLedger: l.inLedger || null,
        beforeAmt: l.beforeAmt,
        afterAmt: l.afterAmt,
        note: l.note?.trim() || null,
        sortOrder: i,
      })),
    }),
    prisma.budgetAmendment.update({
      where: { id },
      data: { title: input.title.trim(), effectiveDate: new Date(input.effectiveDate), reason: input.reason.trim() || null },
    }),
  ]);
  paths(a.projectYear.projectId, a.projectYearId, id);
  return { ok: true, text: "저장했습니다." };
}

/** 반영 — 장부 줄의 증감만큼 조정 레코드 추가. 변경 전 금액이 지금 장부와 다르면 막는다 */
export async function applyAmendment(amendmentId: string): Promise<ActResult> {
  const id = idOf(amendmentId);
  if (!id) return { ok: false, error: "잘못된 협약변경입니다." };
  const a = await prisma.budgetAmendment.findUnique({
    where: { id },
    include: { lines: { orderBy: { sortOrder: "asc" } }, projectYear: { select: { projectId: true } } },
  });
  if (!a) return { ok: false, error: "협약변경을 찾을 수 없습니다." };
  if (a.status !== "DRAFT") return { ok: false, error: "이미 반영됐습니다." };

  const state = await loadLedgerState(a.projectYearId);
  const lines: AmendLine[] = a.lines.map((l) => ({
    key: l.id,
    itemName: l.itemName,
    subName: l.subName,
    detailName: l.detailName,
    fundType: l.fundType === "IN_KIND" ? "IN_KIND" : "CASH",
    inLedger: !!l.inLedger,
    beforeAmt: l.beforeAmt,
    afterAmt: l.afterAmt,
    note: l.note,
  }));
  const errors = review(lines, state.spentBySub, state.spentByItem).filter((f) => f.level === "error");
  if (errors.length) return { ok: false, error: errors.map((e) => e.text).join(" / ") };

  // 변경 전 금액이 지금 장부 편성과 같은지 (초안 작성 뒤 장부가 바뀌었으면 다시 불러와야 함)
  const ledgerLines = lines.filter((l) => l.inLedger);
  const mismatch = ledgerLines.filter((l) => (state.alloc.get(lineKey(l.itemName, l.subName, l.detailName))?.amount ?? 0) !== l.beforeAmt);
  if (mismatch.length) {
    return {
      ok: false,
      error: `변경 전 금액이 지금 장부 편성과 다릅니다: ${mismatch
        .map((l) => `${[l.itemName, l.subName, l.detailName].filter(Boolean).join(" > ")} ${fmt(l.beforeAmt)} ≠ ${fmt(state.alloc.get(lineKey(l.itemName, l.subName, l.detailName))?.amount ?? 0)}`)
        .join(", ")}. "변경 전 다시 불러오기"를 누르세요.`,
    };
  }

  const changes = ledgerLines.filter((l) => l.afterAmt !== l.beforeAmt);
  let seq = (await nextSeqNo(a.projectYearId)) - 1;
  for (const l of changes) {
    const delta = l.afterAmt - l.beforeAmt;
    const bi = await findOrCreateItem(prisma, l.itemName);
    const bs = l.subName ? await findOrCreateSub(prisma, bi.id, l.subName) : null;
    const bd = bs && l.detailName ? await findOrCreateDetail(prisma, bs.id, l.detailName) : null;
    const path = [l.itemName, l.subName, l.detailName].filter(Boolean).join(" > ");
    await prisma.transaction.create({
      data: {
        projectYearId: a.projectYearId,
        seqNo: ++seq,
        date: a.effectiveDate,
        status: "완료",
        direction: delta > 0 ? "IN" : "OUT",
        amount: Math.abs(delta),
        vatRate: 0,
        vatAmount: 0,
        description: `${delta > 0 ? "편성 증액" : "편성 감액"}-${path} [${a.title}] ${fmt(l.beforeAmt)}→${fmt(l.afterAmt)}`,
        budgetAdjust: true,
        amendmentId: a.id,
        budgetItemId: bi.id,
        budgetSubItemId: bs?.id ?? null,
        budgetDetailItemId: bd?.id ?? null,
      },
    });
  }
  await prisma.budgetAmendment.update({ where: { id }, data: { status: "APPLIED", appliedAt: new Date() } });
  await syncPersonnelInKind(a.projectYearId);
  paths(a.projectYear.projectId, a.projectYearId, id);
  return { ok: true, text: `반영했습니다 — 조정 레코드 ${changes.length}건 추가.` };
}

/** 반영 취소 — 이 협약변경이 만든 조정 레코드만 지우고 초안으로 되돌린다. 뒤에 반영된 협약변경이 있으면 막는다 */
export async function unapplyAmendment(amendmentId: string): Promise<ActResult> {
  const id = idOf(amendmentId);
  if (!id) return { ok: false, error: "잘못된 협약변경입니다." };
  const a = await prisma.budgetAmendment.findUnique({ where: { id }, include: { projectYear: { select: { projectId: true } } } });
  if (!a || a.status !== "APPLIED") return { ok: false, error: "반영된 협약변경이 아닙니다." };
  const later = await prisma.budgetAmendment.count({
    where: { projectYearId: a.projectYearId, status: "APPLIED", id: { not: id }, appliedAt: { gt: a.appliedAt ?? new Date(0) } },
  });
  if (later) return { ok: false, error: "이 뒤에 반영된 협약변경이 있습니다. 나중 것부터 반영 취소하세요." };
  const del = await prisma.transaction.deleteMany({ where: { amendmentId: id, budgetAdjust: true } });
  await prisma.budgetAmendment.update({ where: { id }, data: { status: "DRAFT", appliedAt: null } });
  await syncPersonnelInKind(a.projectYearId);
  paths(a.projectYear.projectId, a.projectYearId, id);
  return { ok: true, text: `반영 취소했습니다 — 조정 레코드 ${del.count}건 삭제.` };
}

/** 초안의 장부 줄 "변경 전"을 지금 장부 편성으로 다시 채운다 (변경 후는 그대로, 장부에 새로 생긴 키는 추가) */
export async function reloadBefore(amendmentId: string): Promise<ActResult> {
  const id = idOf(amendmentId);
  if (!id) return { ok: false, error: "잘못된 협약변경입니다." };
  const a = await prisma.budgetAmendment.findUnique({ where: { id }, include: { lines: true, projectYear: { select: { projectId: true } } } });
  if (!a || a.status !== "DRAFT") return { ok: false, error: "초안만 다시 불러올 수 있습니다." };
  const { alloc } = await loadLedgerState(a.projectYearId);
  const seen = new Set<string>();
  let changed = 0;
  for (const l of a.lines.filter((x) => x.inLedger)) {
    const k = lineKey(l.itemName, l.subName, l.detailName);
    seen.add(k);
    const cur = alloc.get(k)?.amount ?? 0;
    if (cur !== l.beforeAmt) {
      await prisma.budgetAmendmentLine.update({ where: { id: l.id }, data: { beforeAmt: cur } });
      changed++;
    }
  }
  let added = 0;
  const base = a.lines.length;
  for (const [k, v] of alloc) {
    if (seen.has(k) || v.amount === 0) continue;
    await prisma.budgetAmendmentLine.create({
      data: { amendmentId: id, itemName: v.itemName, subName: v.subName, detailName: v.detailName, fundType: "CASH", inLedger: true, beforeAmt: v.amount, afterAmt: v.amount, sortOrder: base + added },
    });
    added++;
  }
  paths(a.projectYear.projectId, a.projectYearId, id);
  return { ok: true, text: `변경 전 금액을 다시 불러왔습니다 (바뀐 줄 ${changed} · 추가 ${added}).` };
}

export async function deleteAmendment(amendmentId: string): Promise<ActResult> {
  const id = idOf(amendmentId);
  if (!id) return { ok: false, error: "잘못된 협약변경입니다." };
  const a = await prisma.budgetAmendment.findUnique({ where: { id }, select: { status: true, projectYearId: true, projectYear: { select: { projectId: true } } } });
  if (!a) return { ok: false, error: "협약변경을 찾을 수 없습니다." };
  if (a.status !== "DRAFT") return { ok: false, error: "반영된 협약변경은 반영 취소 후 지울 수 있습니다." };
  await prisma.budgetAmendment.delete({ where: { id } });
  paths(a.projectYear.projectId, a.projectYearId);
  redirect(`/projects/${a.projectYear.projectId}/years/${a.projectYearId}/amendments`);
}

/** 참여율 계산의 현물 인건비 목표를 마지막 반영 협약변경의 현물 인건비로 맞춘다 */
async function syncPersonnelInKind(projectYearId: string) {
  const last = await prisma.budgetAmendment.findFirst({
    where: { projectYearId, status: "APPLIED" },
    orderBy: [{ effectiveDate: "desc" }, { appliedAt: "desc" }],
    include: { lines: true },
  });
  if (!last) return;
  const lines = last.lines.filter((l) => l.fundType === "IN_KIND" && sameCategoryName(l.itemName, "인건비"));
  if (!lines.length) return;
  await prisma.projectYear.update({ where: { id: projectYearId }, data: { personnelInKindTarget: lines.reduce((s, l) => s + l.afterAmt, 0) } });
}
