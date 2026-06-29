"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { FormState } from "@/app/projects/actions";
import {
  saveUpload,
  deleteUpload,
  extOf,
  ALLOWED_EXT,
  MAX_UPLOAD_BYTES,
} from "@/lib/uploads";

function ledgerPath(projectId: number, yearId: number) {
  return `/projects/${projectId}/years/${yearId}/ledger`;
}

function parseTx(fd: FormData): Record<string, string> {
  const get = (k: string) => ((fd.get(k) as string | null) ?? "").trim();
  return {
    status: get("status") || "신청",
    date: get("date"),
    direction: get("direction"),
    amount: get("amount").replace(/,/g, ""), // 콤마 제거
    description: get("description"),
    budgetItemId: get("budgetItemId"),
    budgetSubItemId: get("budgetSubItemId"),
    budgetDetailItemId: get("budgetDetailItemId"),
  };
}

function validateTx(raw: Record<string, string>): Record<string, string> {
  const e: Record<string, string> = {};
  if (!raw.date) e.date = "날짜는 필수입니다.";
  if (!["IN", "OUT"].includes(raw.direction))
    e.direction = "입금/출금을 선택하세요.";
  const amt = Number(raw.amount);
  if (!raw.amount || Number.isNaN(amt) || amt <= 0)
    e.amount = "금액은 0보다 커야 합니다.";
  if (!raw.budgetItemId) e.budgetItemId = "비목을 선택하세요.";
  return e;
}

/** 세세목/세목이 선택되면 그 부모(세목·비목)를 역도출해 분류 일관성 보장 */
async function deriveCategory(raw: Record<string, string>) {
  let budgetItemId = raw.budgetItemId ? Number(raw.budgetItemId) : null;
  let budgetSubItemId = raw.budgetSubItemId ? Number(raw.budgetSubItemId) : null;
  let budgetDetailItemId = raw.budgetDetailItemId
    ? Number(raw.budgetDetailItemId)
    : null;

  if (budgetDetailItemId) {
    const d = await prisma.budgetDetailItem.findUnique({
      where: { id: budgetDetailItemId },
      include: { budgetSubItem: true },
    });
    if (d) {
      budgetSubItemId = d.budgetSubItemId;
      budgetItemId = d.budgetSubItem.budgetItemId;
    } else {
      budgetDetailItemId = null;
    }
  } else if (budgetSubItemId) {
    const s = await prisma.budgetSubItem.findUnique({
      where: { id: budgetSubItemId },
    });
    if (s) budgetItemId = s.budgetItemId;
    else budgetSubItemId = null;
  }
  return { budgetItemId, budgetSubItemId, budgetDetailItemId };
}

export async function createTransaction(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const projectId = Number(fd.get("projectId"));
  const projectYearId = Number(fd.get("projectYearId"));
  if (!projectId || !projectYearId) return { error: "잘못된 연차입니다." };

  const raw = parseTx(fd);
  const fieldErrors = validateTx(raw);
  if (Object.keys(fieldErrors).length) return { fieldErrors, values: raw };

  const cat = await deriveCategory(raw);
  await prisma.transaction.create({
    data: {
      projectYearId,
      status: raw.status,
      date: new Date(raw.date),
      direction: raw.direction,
      amount: Math.round(Number(raw.amount)),
      description: raw.description || null,
      ...cat,
    },
  });
  revalidatePath(ledgerPath(projectId, projectYearId));
  revalidatePath(`/projects/${projectId}`);
  return { values: {} }; // 폼 초기화(연속 입력)
}

export async function updateTransaction(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const id = Number(fd.get("id"));
  const projectId = Number(fd.get("projectId"));
  const projectYearId = Number(fd.get("projectYearId"));
  if (!id || !projectId || !projectYearId)
    return { error: "잘못된 거래입니다." };

  const raw = parseTx(fd);
  const fieldErrors = validateTx(raw);
  if (Object.keys(fieldErrors).length) return { fieldErrors, values: raw };

  const cat = await deriveCategory(raw);
  await prisma.transaction.update({
    where: { id },
    data: {
      status: raw.status,
      date: new Date(raw.date),
      direction: raw.direction,
      amount: Math.round(Number(raw.amount)),
      description: raw.description || null,
      ...cat,
    },
  });
  revalidatePath(ledgerPath(projectId, projectYearId));
  revalidatePath(`/projects/${projectId}`);
  redirect(ledgerPath(projectId, projectYearId));
}

export async function deleteTransaction(fd: FormData): Promise<void> {
  const id = Number(fd.get("id"));
  const projectId = Number(fd.get("projectId"));
  const projectYearId = Number(fd.get("projectYearId"));
  if (!id) return;
  // 첨부 파일도 디스크에서 제거 (DB 레코드는 cascade로 삭제됨)
  const atts = await prisma.attachment.findMany({
    where: { transactionId: id },
    select: { storedName: true },
  });
  await prisma.transaction.delete({ where: { id } });
  await Promise.all(atts.map((a) => deleteUpload(a.storedName)));
  if (projectId && projectYearId) {
    revalidatePath(ledgerPath(projectId, projectYearId));
    revalidatePath(`/projects/${projectId}`);
  }
}

// ---------- 증빙 첨부 ----------

function txEditPath(projectId: number, yearId: number, txId: number) {
  return `/projects/${projectId}/years/${yearId}/ledger/${txId}/edit`;
}

export async function uploadAttachment(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const transactionId = Number(fd.get("transactionId"));
  const projectId = Number(fd.get("projectId"));
  const projectYearId = Number(fd.get("projectYearId"));
  if (!transactionId || !projectId || !projectYearId)
    return { error: "잘못된 거래입니다." };

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { fieldErrors: { file: "파일을 선택하세요." } };
  if (file.size > MAX_UPLOAD_BYTES)
    return { fieldErrors: { file: "파일은 20MB 이하만 업로드할 수 있습니다." } };
  if (!ALLOWED_EXT.has(extOf(file.name)))
    return { fieldErrors: { file: "허용되지 않는 파일 형식입니다." } };

  const { storedName, size } = await saveUpload(file);
  await prisma.attachment.create({
    data: {
      transactionId,
      fileName: file.name,
      storedName,
      mimeType: file.type || null,
      size,
    },
  });
  revalidatePath(txEditPath(projectId, projectYearId, transactionId));
  revalidatePath(ledgerPath(projectId, projectYearId));
  return { values: {} };
}

export async function deleteAttachment(fd: FormData): Promise<void> {
  const id = Number(fd.get("id"));
  if (!id) return;
  const att = await prisma.attachment.findUnique({ where: { id } });
  if (!att) return;
  await prisma.attachment.delete({ where: { id } });
  await deleteUpload(att.storedName);

  const projectId = Number(fd.get("projectId"));
  const projectYearId = Number(fd.get("projectYearId"));
  const transactionId = Number(fd.get("transactionId"));
  if (projectId && projectYearId && transactionId) {
    revalidatePath(txEditPath(projectId, projectYearId, transactionId));
    revalidatePath(ledgerPath(projectId, projectYearId));
  }
}
