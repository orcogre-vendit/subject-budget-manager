"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createElement } from "react";
import { prisma } from "@/lib/prisma";
import type { FormState } from "@/app/projects/actions";
import {
  saveUploadBuffer,
  deleteUpload,
  extOf,
  ALLOWED_EXT,
  MAX_UPLOAD_BYTES,
  looksEncryptedPdf,
} from "@/lib/uploads";
import { normalizeFileName } from "@/lib/uploadRules";
import { vatOf, lineAmount } from "@/lib/money";
import { buildDocContext, docInclude, loadInspectionPhotos } from "@/lib/documents/context";
import { renderPurchaseRequest } from "@/lib/templates/purchaseRequest";
import {
  renderExpenseReportSupply,
  renderExpenseReportVat,
} from "@/lib/templates/expenseReport";
import { renderPdfFile } from "@/lib/pdf/render";
import InspectionCert from "@/lib/pdf/InspectionCert";
import PurchaseRequest from "@/lib/pdf/PurchaseRequest";

function ledgerPath(projectId: number, yearId: number) {
  return `/projects/${projectId}/years/${yearId}/ledger`;
}
function txEditPath(projectId: number, yearId: number, txId: number) {
  return `/projects/${projectId}/years/${yearId}/ledger/${txId}/edit`;
}

// ---------- 파싱 / 검증 ----------

function parseTx(fd: FormData): Record<string, string> {
  const get = (k: string) => ((fd.get(k) as string | null) ?? "").trim();
  return {
    status: get("status") || "신청",
    date: get("date"),
    direction: get("direction"),
    amount: get("amount").replace(/,/g, ""), // 공급가액, 콤마 제거
    description: get("description"),
    budgetItemId: get("budgetItemId"),
    budgetSubItemName: get("budgetSubItemName"),
    budgetDetailItemName: get("budgetDetailItemName"),
    vendor: get("vendor"),
    vendorBank: get("vendorBank"),
    vendorAccount: get("vendorAccount"),
    vendorHolder: get("vendorHolder"),
    purpose: get("purpose"),
    paymentMethod: get("paymentMethod"),
    deliveryDate: get("deliveryDate"),
    inspectionDate: get("inspectionDate"),
    installLocation: get("installLocation"),
    paymentDueDate: get("paymentDueDate"),
    vatRate: get("vatRate"),
    vatAmount: get("vatAmount").replace(/,/g, ""),
    items: get("items"), // JSON 배열 문자열
  };
}

type ItemIn = {
  name: string;
  spec: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
};

/** 품목 JSON → 검증된 품목 목록. 빈 행(품목명 없음)은 무시 */
function parseItems(raw: string): { items: ItemIn[]; error?: string } {
  if (!raw) return { items: [] };
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    return { items: [], error: "품목 형식이 올바르지 않습니다." };
  }
  if (!Array.isArray(arr)) return { items: [], error: "품목 형식이 올바르지 않습니다." };
  const items: ItemIn[] = [];
  for (const r of arr as Record<string, unknown>[]) {
    const name = String(r.name ?? "").trim();
    if (!name) continue;
    const quantity = Math.trunc(Number(r.quantity));
    const unitPrice = Math.trunc(Number(String(r.unitPrice ?? "").replace(/,/g, "")));
    if (!Number.isFinite(quantity) || quantity < 1)
      return { items: [], error: `'${name}' 수량은 1 이상이어야 합니다.` };
    if (!Number.isFinite(unitPrice) || unitPrice < 0)
      return { items: [], error: `'${name}' 단가가 올바르지 않습니다.` };
    items.push({
      name,
      spec: String(r.spec ?? "").trim() || null,
      quantity,
      unitPrice,
      amount: lineAmount(quantity, unitPrice),
    });
  }
  return { items };
}

const itemsSum = (items: ItemIn[]) => items.reduce((s, it) => s + it.amount, 0);

function validateTx(raw: Record<string, string>, items: ItemIn[]): Record<string, string> {
  const e: Record<string, string> = {};
  if (!raw.date) e.date = "날짜는 필수입니다.";
  if (!["IN", "OUT"].includes(raw.direction)) e.direction = "입금/출금을 선택하세요.";
  // 품목 합계가 0(단가 미입력)이면 직접 입력한 금액을 쓴다 — 품목 행만 있다고 금액을 0 으로 덮어쓰지 않는다
  if (itemsSum(items) <= 0) {
    const amt = Number(raw.amount);
    if (!raw.amount || Number.isNaN(amt) || amt <= 0)
      e.amount = items.length ? "품목 단가를 입력하거나 공급가액을 직접 입력하세요." : "금액은 0보다 커야 합니다.";
  }
  if (!raw.budgetItemId) e.budgetItemId = "비목을 선택하세요.";
  if (raw.vatRate !== "") {
    const r = Number(raw.vatRate);
    if (!Number.isInteger(r) || r < 0 || r > 100) e.vatRate = "부가세율은 0~100 정수여야 합니다.";
  }
  if (raw.vatAmount !== "" && (Number.isNaN(Number(raw.vatAmount)) || Number(raw.vatAmount) < 0))
    e.vatAmount = "부가세는 0 이상이어야 합니다.";
  if (raw.deliveryDate && raw.inspectionDate && raw.inspectionDate < raw.deliveryDate)
    e.inspectionDate = "검수일은 납품일 이후여야 합니다.";
  return e;
}

/** 공급가액·부가세 확정 — 품목 합계가 있으면 합계로, 없으면 직접 입력값. 부가세는 미입력 시 율로 자동 계산. 입금(IN)은 부가세 없음 */
function deriveMoney(raw: Record<string, string>, items: ItemIn[]) {
  const sum = itemsSum(items);
  const amount = sum > 0 ? sum : Math.round(Number(raw.amount));
  if (raw.direction === "IN") return { amount, vatRate: 0, vatAmount: 0 };
  const vatRate = raw.vatRate === "" ? 10 : Math.trunc(Number(raw.vatRate));
  const vatAmount =
    raw.vatAmount !== "" ? Math.trunc(Number(raw.vatAmount)) : vatOf(amount, vatRate);
  return { amount, vatRate, vatAmount };
}

/** 비목 아래로 세목·세세목을 이름으로 찾거나 새로 등록(find-or-create) */
async function resolveCategory(raw: Record<string, string>) {
  const budgetItemId = raw.budgetItemId ? Number(raw.budgetItemId) : null;
  let budgetSubItemId: number | null = null;
  let budgetDetailItemId: number | null = null;

  if (budgetItemId && raw.budgetSubItemName) {
    const sub = await prisma.budgetSubItem.upsert({
      where: { budgetItemId_name: { budgetItemId, name: raw.budgetSubItemName } },
      update: {},
      create: { budgetItemId, name: raw.budgetSubItemName },
    });
    budgetSubItemId = sub.id;
    if (raw.budgetDetailItemName) {
      const det = await prisma.budgetDetailItem.upsert({
        where: { budgetSubItemId_name: { budgetSubItemId, name: raw.budgetDetailItemName } },
        update: {},
        create: { budgetSubItemId, name: raw.budgetDetailItemName },
      });
      budgetDetailItemId = det.id;
    }
  }
  return { budgetItemId, budgetSubItemId, budgetDetailItemId };
}

const toDate = (s: string) => (s ? new Date(s) : null);

/** create/update 공용 데이터 (projectYearId·items 제외) */
function txData(
  raw: Record<string, string>,
  cat: Awaited<ReturnType<typeof resolveCategory>>,
  money: ReturnType<typeof deriveMoney>,
) {
  return {
    status: raw.status,
    date: new Date(raw.date),
    direction: raw.direction,
    amount: money.amount,
    vatRate: money.vatRate,
    vatAmount: money.vatAmount,
    description: raw.description || null,
    vendor: raw.vendor || null,
    vendorBank: raw.vendorBank || null,
    vendorAccount: raw.vendorAccount || null,
    vendorHolder: raw.vendorHolder || null,
    purpose: raw.purpose || null,
    paymentMethod: raw.paymentMethod || null,
    deliveryDate: toDate(raw.deliveryDate),
    inspectionDate: toDate(raw.inspectionDate),
    installLocation: raw.installLocation || null,
    paymentDueDate: toDate(raw.paymentDueDate),
    ...cat,
  };
}

const itemRows = (items: ItemIn[]) => items.map((it, i) => ({ ...it, sortOrder: i }));

// ---------- 증빙 파일 공통 ----------

/** RCMS 업로드 요건 검증 — 통과하면 읽어둔 버퍼를 돌려준다 (저장 시 재사용) */
async function checkEvidenceFile(file: File): Promise<{ buf: Buffer } | { error: string }> {
  if (file.size > MAX_UPLOAD_BYTES) return { error: `'${file.name}' 은(는) 20MB 를 넘습니다.` };
  if (!ALLOWED_EXT.has(extOf(file.name)))
    return { error: `'${file.name}' 형식은 허용되지 않습니다. (PDF·이미지·오피스·HWP)` };
  const buf = Buffer.from(await file.arrayBuffer());
  if (looksEncryptedPdf(buf, file.name))
    return { error: `'${file.name}' 은(는) 암호화(DRM)된 PDF 라 RCMS 에 올릴 수 없습니다. 암호를 해제한 파일을 올려주세요.` };
  return { buf };
}

async function storeAttachment(transactionId: number, file: File, buf: Buffer, evidenceCode: string | null) {
  const fileName = normalizeFileName(file.name); // NFC 정규화·금지문자 제거 — 표시·다운로드 파일명
  const { storedName, size } = await saveUploadBuffer(buf, fileName);
  await prisma.attachment.create({
    data: { transactionId, fileName, storedName, mimeType: file.type || null, size, evidenceCode },
  });
}

/** 거래 추가 폼의 증빙 줄 — evidenceCode[i] 와 evidenceFile[i] 는 같은 순서로 들어온다. 파일 없는 줄은 무시 */
function pickEvidenceRows(fd: FormData): { file: File; code: string | null }[] {
  const files = fd.getAll("evidenceFile");
  const codes = fd.getAll("evidenceCode").map((c) => String(c ?? "").trim() || null);
  const out: { file: File; code: string | null }[] = [];
  files.forEach((f, i) => {
    if (f instanceof File && f.size > 0 && f.name) out.push({ file: f, code: codes[i] ?? null });
  });
  return out;
}

// ---------- 거래 ----------

export async function createTransaction(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const projectId = Number(fd.get("projectId"));
  const projectYearId = Number(fd.get("projectYearId"));
  if (!projectId || !projectYearId) return { error: "잘못된 연차입니다." };

  const raw = parseTx(fd);
  const parsed = parseItems(raw.items);
  const fieldErrors = validateTx(raw, parsed.items);
  if (parsed.error) fieldErrors.items = parsed.error;

  // 함께 올린 증빙 — 거래를 만들기 전에 전부 검증해 반쪽 저장을 막는다
  const evidence: { file: File; code: string | null; buf: Buffer }[] = [];
  for (const row of pickEvidenceRows(fd)) {
    const c = await checkEvidenceFile(row.file);
    if ("error" in c) {
      fieldErrors.evidenceFile = c.error;
      break;
    }
    evidence.push({ ...row, buf: c.buf });
  }
  if (Object.keys(fieldErrors).length) return { fieldErrors, values: raw };

  const cat = await resolveCategory(raw);
  const money = deriveMoney(raw, parsed.items);
  const tx = await prisma.transaction.create({
    data: {
      projectYearId,
      ...txData(raw, cat, money),
      items: { create: itemRows(parsed.items) },
    },
  });
  for (const e of evidence) await storeAttachment(tx.id, e.file, e.buf, e.code);

  revalidatePath(ledgerPath(projectId, projectYearId));
  revalidatePath(`/projects/${projectId}`);
  return { values: {}, nonce: Date.now() }; // 폼 초기화(연속 입력)
}

export async function updateTransaction(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const id = Number(fd.get("id"));
  const projectId = Number(fd.get("projectId"));
  const projectYearId = Number(fd.get("projectYearId"));
  if (!id || !projectId || !projectYearId) return { error: "잘못된 거래입니다." };

  const raw = parseTx(fd);
  const parsed = parseItems(raw.items);
  const fieldErrors = validateTx(raw, parsed.items);
  if (parsed.error) fieldErrors.items = parsed.error;
  if (Object.keys(fieldErrors).length) return { fieldErrors, values: raw };

  const cat = await resolveCategory(raw);
  const money = deriveMoney(raw, parsed.items);
  await prisma.transaction.update({
    where: { id },
    data: {
      ...txData(raw, cat, money),
      items: { deleteMany: {}, create: itemRows(parsed.items) },
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
  // 첨부·생성PDF 파일도 디스크에서 제거 (DB 레코드는 cascade)
  const [atts, docs] = await Promise.all([
    prisma.attachment.findMany({ where: { transactionId: id }, select: { storedName: true } }),
    prisma.generatedDocument.findMany({
      where: { transactionId: id, filePath: { not: null } },
      select: { filePath: true },
    }),
  ]);
  await prisma.transaction.delete({ where: { id } });
  await Promise.all([
    ...atts.map((a) => deleteUpload(a.storedName)),
    ...docs.map((d) => deleteUpload(d.filePath!)),
  ]);
  if (projectId && projectYearId) {
    revalidatePath(ledgerPath(projectId, projectYearId));
    revalidatePath(`/projects/${projectId}`);
  }
}

// ---------- 증빙 첨부 ----------

/** 거래 수정 화면 — 드롭존에 올린 여러 증빙을 한 번에 업로드 (evidenceFile[i] ↔ evidenceCode[i]) */
export async function uploadAttachments(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const transactionId = Number(fd.get("transactionId"));
  const projectId = Number(fd.get("projectId"));
  const projectYearId = Number(fd.get("projectYearId"));
  if (!transactionId || !projectId || !projectYearId) return { error: "잘못된 거래입니다." };

  const rows = pickEvidenceRows(fd);
  if (!rows.length) return { fieldErrors: { file: "파일을 올려주세요." } };

  // 전부 검증한 뒤 저장 — 중간에 실패해 일부만 올라가는 일을 막는다
  const checked: { file: File; code: string | null; buf: Buffer }[] = [];
  for (const row of rows) {
    const c = await checkEvidenceFile(row.file);
    if ("error" in c) return { fieldErrors: { file: c.error } };
    checked.push({ ...row, buf: c.buf });
  }
  for (const c of checked) await storeAttachment(transactionId, c.file, c.buf, c.code);

  revalidatePath(txEditPath(projectId, projectYearId, transactionId));
  revalidatePath(ledgerPath(projectId, projectYearId));
  return { values: {}, nonce: Date.now() };
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

// ---------- 서류 생성 ----------
// templateCode: PURCHASE_REQUEST(품의서 텍스트) | PURCHASE_REQUEST_PDF | INSPECTION_CERT(PDF)
//               | EXPENSE_REPORT(지결 연구비) | EXPENSE_REPORT_VAT(지결 부가세, vatAmount>0)

export async function generateDocument(fd: FormData): Promise<void> {
  const transactionId = Number(fd.get("transactionId"));
  const projectId = Number(fd.get("projectId"));
  const projectYearId = Number(fd.get("projectYearId"));
  const templateCode = String(fd.get("templateCode") ?? "");
  if (!transactionId || !projectId || !projectYearId) return;

  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: docInclude,
  });
  if (!tx || tx.projectYearId !== projectYearId) return;

  const ctx = buildDocContext(tx);
  const relDir = `generated/${tx.id}`;
  const stamp = Date.now();
  const base = { transactionId: tx.id, projectYearId, templateCode };

  switch (templateCode) {
    case "PURCHASE_REQUEST":
      await prisma.generatedDocument.create({
        data: { ...base, format: "text", content: renderPurchaseRequest(ctx) },
      });
      break;
    case "EXPENSE_REPORT":
      await prisma.generatedDocument.create({
        data: { ...base, format: "text", content: renderExpenseReportSupply(ctx) },
      });
      break;
    case "EXPENSE_REPORT_VAT":
      if (tx.vatAmount <= 0) return;
      await prisma.generatedDocument.create({
        data: { ...base, format: "text", content: renderExpenseReportVat(ctx) },
      });
      break;
    case "PURCHASE_REQUEST_PDF": {
      const { relPath } = await renderPdfFile(
        createElement(PurchaseRequest, { ctx }),
        relDir,
        `purchase-request-${stamp}.pdf`,
      );
      await prisma.generatedDocument.create({ data: { ...base, format: "pdf", filePath: relPath } });
      break;
    }
    case "INSPECTION_CERT": {
      // 검수 사진(INSPECTION_PHOTO 태그 첨부)을 붙임 페이지로 삽입
      const photos = await loadInspectionPhotos(tx);
      const { relPath } = await renderPdfFile(
        createElement(InspectionCert, { ctx: buildDocContext(tx, { photos }) }),
        relDir,
        `inspection-cert-${stamp}.pdf`,
      );
      await prisma.generatedDocument.create({ data: { ...base, format: "pdf", filePath: relPath } });
      break;
    }
    default:
      return;
  }
  revalidatePath(txEditPath(projectId, projectYearId, transactionId));
}

export async function deleteDocument(fd: FormData): Promise<void> {
  const id = Number(fd.get("id"));
  if (!id) return;
  const doc = await prisma.generatedDocument.findUnique({ where: { id } });
  if (!doc) return;
  await prisma.generatedDocument.delete({ where: { id } });
  if (doc.filePath) await deleteUpload(doc.filePath);

  const projectId = Number(fd.get("projectId"));
  const projectYearId = Number(fd.get("projectYearId"));
  const transactionId = Number(fd.get("transactionId"));
  if (projectId && projectYearId && transactionId)
    revalidatePath(txEditPath(projectId, projectYearId, transactionId));
}
