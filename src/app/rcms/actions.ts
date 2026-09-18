"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { FormState } from "@/app/projects/actions";
import { parseRcmsExport, parseRcmsBudgetPath, type RcmsRow } from "@/lib/rcms/parse";
import { autoMatch } from "@/lib/rcms/match";
import { txInclude } from "@/lib/rcms/db";
import { nextSeqNo } from "@/lib/seq";
import { findOrCreateItem, resolveSubAndDetail } from "@/lib/categories";

const MAX_BYTES = 10 * 1024 * 1024;

function recordData(row: RcmsRow) {
  return {
    rcmsProjectNo: row.rcmsProjectNo,
    stage: row.stage,
    yearNo: row.yearNo,
    registeredAt: row.registeredAt,
    useDate: row.useDate,
    progress: row.progress,
    execStatus: row.execStatus,
    evidenceType: row.evidenceType,
    budgetPath: row.budgetPath,
    useAmount: row.useAmount,
    supplyAmount: row.supplyAmount,
    vatAmount: row.vatAmount,
    vendor: row.vendor,
    vendorBizNo: row.vendorBizNo,
    bank: row.bank,
    account: row.account,
    holder: row.holder,
    purpose: row.purpose,
    regType: row.regType,
    execStage: row.execStage,
    itemName: row.itemName,
    raw: JSON.stringify(row.raw),
  };
}

type Syncable = { supplyAmount: number; vatAmount: number; vendor: string | null; progress: string | null };

/** RCMS 실집행액을 장부 거래에 반영 — 실행된 집행은 RCMS 가 원본. 품의 금액은 plannedAmount 에 보존 */
async function syncTransaction(txId: number, rec: Syncable) {
  const tx = await prisma.transaction.findUnique({
    where: { id: txId },
    select: { amount: true, plannedAmount: true, vendor: true, status: true },
  });
  if (!tx) return;
  await prisma.transaction.update({
    where: { id: txId },
    data: {
      plannedAmount: tx.plannedAmount ?? tx.amount,
      amount: rec.supplyAmount > 0 ? rec.supplyAmount : tx.amount,
      vatAmount: rec.vatAmount,
      vendor: tx.vendor || rec.vendor,
      // RCMS 임시저장은 아직 등록 전이므로 상태를 올리지 않는다
      status: tx.status === "취소" ? "취소" : rec.progress === "임시저장" ? tx.status : "완료",
    },
  });
}

async function applyMatch(recordId: number, txId: number, method: "auto" | "manual"): Promise<boolean> {
  const [rec, tx] = await Promise.all([
    prisma.rcmsRecord.findUnique({ where: { id: recordId } }),
    prisma.transaction.findUnique({
      where: { id: txId },
      select: { id: true, projectYearId: true, direction: true, rcmsRecord: { select: { id: true } } },
    }),
  ]);
  if (!rec || !tx || rec.transactionId || tx.rcmsRecord) return false;
  if (rec.projectYearId !== tx.projectYearId || tx.direction !== "OUT") return false;
  await prisma.rcmsRecord.update({ where: { id: recordId }, data: { transactionId: txId, matchMethod: method } });
  await syncTransaction(txId, rec);
  return true;
}

async function autoMatchYears(yearIds: number[]): Promise<number> {
  let n = 0;
  for (const projectYearId of yearIds) {
    const [records, txs] = await Promise.all([
      prisma.rcmsRecord.findMany({ where: { projectYearId, transactionId: null } }),
      prisma.transaction.findMany({
        where: { projectYearId, direction: "OUT", status: { not: "취소" }, rcmsRecord: null },
        include: txInclude,
      }),
    ]);
    for (const m of autoMatch(records, txs)) if (await applyMatch(m.recordId, m.txId, "auto")) n++;
  }
  return n;
}

async function revalidateYears(yearIds: number[]) {
  revalidatePath("/rcms");
  revalidatePath("/");
  const years = await prisma.projectYear.findMany({ where: { id: { in: yearIds } }, select: { id: true, projectId: true } });
  for (const y of years) {
    revalidatePath(`/rcms/${y.id}`);
    revalidatePath(`/projects/${y.projectId}/years/${y.id}/ledger`);
    revalidatePath(`/projects/${y.projectId}`);
  }
}

// ---------- 엑셀 가져오기 ----------

export async function importRcms(_prev: FormState, fd: FormData): Promise<FormState> {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { fieldErrors: { file: "RCMS 엑셀 파일을 선택하세요." } };
  if (!/\.xlsx$/i.test(file.name)) return { fieldErrors: { file: ".xlsx 파일만 가져올 수 있습니다." } };
  if (file.size > MAX_BYTES) return { fieldErrors: { file: "파일이 너무 큽니다 (10MB 이하)." } };

  let parsed: ReturnType<typeof parseRcmsExport>;
  try {
    parsed = parseRcmsExport(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "파일을 읽을 수 없습니다." };
  }
  if (!parsed.rows.length) return { error: "가져올 행이 없습니다. (헤더 아래에 데이터가 없음)" };

  // RCMS 과제번호(숫자) ↔ 과제 코드(숫자 부분 끝자리 일치), 연차 ↔ ProjectYear.yearNo
  const projects = await prisma.project.findMany({
    select: { id: true, code: true, name: true, years: { select: { id: true, yearNo: true } } },
  });
  const resolveYear = (row: RcmsRow): { yearId: number } | { reason: string } => {
    const digits = row.rcmsProjectNo.replace(/\D/g, "");
    if (!digits) return { reason: `과제번호가 비어 있음` };
    const proj = projects.find((p) => {
      const cd = (p.code ?? "").replace(/\D/g, "");
      return !!cd && (cd === digits || cd.endsWith(digits));
    });
    if (!proj) return { reason: `과제번호 ${row.rcmsProjectNo} 에 해당하는 과제가 없음 (과제 코드에 ${digits} 이 포함되어야 함)` };
    if (row.yearNo === null) return { reason: `${proj.name}: 연차 값 없음` };
    const y = proj.years.find((yy) => yy.yearNo === row.yearNo);
    if (!y) return { reason: `${proj.name}: ${row.yearNo}년차가 등록되어 있지 않음` };
    return { yearId: y.id };
  };

  const now = new Date();
  const seen = new Map<number, Set<string>>();
  const skipped = new Map<string, number>();
  let created = 0;
  let updated = 0;

  for (const row of parsed.rows) {
    const r = resolveYear(row);
    if ("reason" in r) {
      skipped.set(r.reason, (skipped.get(r.reason) ?? 0) + 1);
      continue;
    }
    const data = recordData(row);
    const existing = await prisma.rcmsRecord.findUnique({ where: { key: row.key }, select: { id: true, transactionId: true } });
    if (existing) {
      await prisma.rcmsRecord.update({
        where: { id: existing.id },
        data: { ...data, projectYearId: r.yearId, lastSeenAt: now, missingSince: null },
      });
      updated++;
      if (existing.transactionId) await syncTransaction(existing.transactionId, row);
    } else {
      await prisma.rcmsRecord.create({
        data: { ...data, key: row.key, projectYearId: r.yearId, firstSeenAt: now, lastSeenAt: now },
      });
      created++;
    }
    const set = seen.get(r.yearId) ?? new Set<string>();
    set.add(row.key);
    seen.set(r.yearId, set);
  }

  // 이번 파일에 등장한 연차 안에서, 파일에 없는 기존 건 → 목록에서 사라짐(이체 실행 완료 추정)
  let missing = 0;
  for (const [projectYearId, keys] of seen) {
    const res = await prisma.rcmsRecord.updateMany({
      where: { projectYearId, missingSince: null, key: { notIn: [...keys] } },
      data: { missingSince: now },
    });
    missing += res.count;
  }

  const yearIds = [...seen.keys()];
  const matched = await autoMatchYears(yearIds);

  await prisma.rcmsImport.create({
    data: {
      fileName: file.name,
      rowCount: parsed.rows.length,
      newCount: created,
      updatedCount: updated,
      missingCount: missing,
      matchedCount: matched,
      skipped: skipped.size ? JSON.stringify([...skipped]) : null,
    },
  });
  await revalidateYears(yearIds);

  return {
    values: {
      summary: `${parsed.rows.length}행 읽음 · 신규 ${created} · 갱신 ${updated} · 자동매칭 ${matched} · 목록에서 사라짐 ${missing}`,
      skipped: [...skipped].map(([reason, n]) => `${reason} (${n}건)`).join("\n"),
    },
  };
}

// ---------- 수동 매칭 ----------

export async function matchRecord(fd: FormData): Promise<void> {
  const recordId = Number(fd.get("recordId"));
  const transactionId = Number(fd.get("transactionId"));
  const yearId = Number(fd.get("yearId"));
  if (!recordId || !transactionId) return;
  await applyMatch(recordId, transactionId, "manual");
  if (yearId) await revalidateYears([yearId]);
}

export async function unmatchRecord(fd: FormData): Promise<void> {
  const recordId = Number(fd.get("recordId"));
  const yearId = Number(fd.get("yearId"));
  if (!recordId) return;
  const rec = await prisma.rcmsRecord.findUnique({ where: { id: recordId }, select: { transactionId: true } });
  if (!rec?.transactionId) return;
  await prisma.rcmsRecord.update({ where: { id: recordId }, data: { transactionId: null, matchMethod: null } });
  // 품의 금액으로 되돌림 (부가세·상태는 그대로 둔다)
  const tx = await prisma.transaction.findUnique({ where: { id: rec.transactionId }, select: { plannedAmount: true } });
  if (tx?.plannedAmount !== null && tx?.plannedAmount !== undefined) {
    await prisma.transaction.update({ where: { id: rec.transactionId }, data: { amount: tx.plannedAmount, plannedAmount: null } });
  }
  if (yearId) await revalidateYears([yearId]);
}

/** RCMS 비목정보로 우리 비목/세목/세세목을 찾거나 등록. 이름은 정규화해 비교하므로 RCMS 표기가 조금 달라도 표준 항목에 붙는다 */
async function resolveBudget(path: string | null) {
  const { item, sub, detail } = parseRcmsBudgetPath(path);
  if (!item) return { budgetItemId: null, budgetSubItemId: null, budgetDetailItemId: null };
  const bi = await findOrCreateItem(prisma, item, 99);
  return resolveSubAndDetail(prisma, bi.id, sub, detail);
}

/** 품의 없이 RCMS 에만 있는 건 → 장부 거래를 만들어 연결 (수동 입력 대체) */
export async function createTransactionFromRecord(fd: FormData): Promise<void> {
  const recordId = Number(fd.get("recordId"));
  const yearId = Number(fd.get("yearId"));
  if (!recordId) return;
  const rec = await prisma.rcmsRecord.findUnique({ where: { id: recordId } });
  if (!rec || rec.transactionId) return;
  const cat = await resolveBudget(rec.budgetPath);
  const isCard = (rec.evidenceType ?? "").includes("카드");
  const tx = await prisma.transaction.create({
    data: {
      projectYearId: rec.projectYearId,
      seqNo: await nextSeqNo(rec.projectYearId),
      date: rec.useDate ?? rec.registeredAt ?? new Date(),
      status: rec.progress === "임시저장" ? "신청" : "완료",
      direction: "OUT",
      amount: rec.supplyAmount,
      vatRate: rec.vatAmount > 0 ? 10 : 0,
      vatAmount: rec.vatAmount,
      description: rec.itemName ?? rec.vendor ?? "RCMS 등록 건",
      vendor: rec.vendor,
      vendorBank: rec.bank,
      vendorAccount: rec.account,
      vendorHolder: rec.holder,
      purpose: rec.purpose,
      paymentMethod: isCard ? "연구비카드" : "RCMS 계좌이체",
      ...cat,
    },
  });
  await prisma.rcmsRecord.update({ where: { id: recordId }, data: { transactionId: tx.id, matchMethod: "created" } });
  if (yearId) await revalidateYears([yearId]);
}
