"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createElement } from "react";
import { prisma } from "@/lib/prisma";
import type { FormState } from "@/app/projects/actions";
import { idOf } from "@/lib/ids";
import {
  promoteStaged,
  deleteUpload,
  extOf,
  ALLOWED_EXT,
  MAX_UPLOAD_BYTES,
  looksEncryptedPdfAt,
} from "@/lib/uploads";
import { STAGING_PREFIX, headObject } from "@/lib/storage";
import { normalizeFileName } from "@/lib/uploadRules";
import { pickEvidenceFileName, type NamingContext } from "@/lib/evidenceName";
import { nextSeqNo } from "@/lib/seq";
import { vatOf, lineAmount, normalizeUnitPrice } from "@/lib/money";
import { resolveSubAndDetail } from "@/lib/categories";
import { renameAttachmentsFor } from "@/lib/attachmentNames";
import { buildDocContext, docInclude, loadInspectionPhotos } from "@/lib/documents/context";
import { renderPurchaseRequest } from "@/lib/templates/purchaseRequest";
import {
  renderExpenseReportSupply,
  renderExpenseReportVat,
} from "@/lib/templates/expenseReport";
import { renderPdfFile } from "@/lib/pdf/render";
import { probeImage } from "@/lib/pdf/probe";
import InspectionCert from "@/lib/pdf/InspectionCert";
import PurchaseRequest from "@/lib/pdf/PurchaseRequest";

function ledgerPath(projectId: string, yearId: string) {
  return `/projects/${projectId}/years/${yearId}/ledger`;
}
function txEditPath(projectId: string, yearId: string, txId: string) {
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
  unitPrice: string; // 십진 문자열 (소수 2자리까지)
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
    const unitPrice = normalizeUnitPrice(String(r.unitPrice ?? ""));
    if (!Number.isFinite(quantity) || quantity < 1)
      return { items: [], error: `'${name}' 수량은 1 이상이어야 합니다.` };
    if (unitPrice === null)
      return { items: [], error: `'${name}' 단가가 올바르지 않습니다. (숫자, 소수점 2자리까지)` };
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
  else if (!idOf(raw.budgetItemId)) e.budgetItemId = "비목이 올바르지 않습니다.";
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

/** 비목 아래로 세목·세세목을 이름으로 찾거나 새로 등록(find-or-create). 띄어쓰기·가운뎃점 차이는 기존 항목으로 맞춘다 */
async function resolveCategory(raw: Record<string, string>) {
  return resolveSubAndDetail(prisma, idOf(raw.budgetItemId), raw.budgetSubItemName, raw.budgetDetailItemName);
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
// 파일은 브라우저가 S3 staging/ 에 직접 올리고, 폼에는 evidenceKey/Name/Type/Size/Code 묶음이 같은 순서로 실린다.

type EvidenceRow = { key: string; name: string; type: string; size: number; code: string | null };

/** 폼의 증빙 줄 읽기 — 업로드가 끝나지 않은 줄이 있으면(evidencePending) 저장을 거부 */
function pickEvidenceRows(fd: FormData): { rows: EvidenceRow[]; error?: string } {
  if (fd.get("evidencePending")) return { rows: [], error: "증빙 업로드가 끝나기 전에 저장했습니다. 업로드가 끝난 뒤 다시 시도하세요." };
  const keys = fd.getAll("evidenceKey").map((v) => String(v ?? "").trim());
  const names = fd.getAll("evidenceName").map((v) => normalizeFileName(String(v ?? "")));
  const types = fd.getAll("evidenceType").map((v) => String(v ?? "").trim() || "application/octet-stream");
  const sizes = fd.getAll("evidenceSize").map((v) => Number(v));
  const codes = fd.getAll("evidenceCode").map((c) => String(c ?? "").trim() || null);
  const rows: EvidenceRow[] = [];
  keys.forEach((key, i) => {
    if (!key) return;
    rows.push({ key, name: names[i] ?? "", type: types[i] ?? "application/octet-stream", size: sizes[i] ?? 0, code: codes[i] ?? null });
  });
  return { rows };
}

/** RCMS 업로드 요건 검증 — S3 에 실제로 올라갔는지, 크기·형식·PDF 암호화까지 본다 */
async function checkEvidence(row: EvidenceRow): Promise<{ size: number } | { error: string }> {
  if (!row.key.startsWith(STAGING_PREFIX) || row.key.includes("..")) return { error: "잘못된 업로드 키입니다." };
  if (!row.name || !ALLOWED_EXT.has(extOf(row.name)))
    return { error: `'${row.name || row.key}' 형식은 허용되지 않습니다. (PDF·이미지·오피스·HWP)` };
  const head = await headObject(row.key);
  if (!head) return { error: `'${row.name}' 업로드가 확인되지 않습니다. 다시 올려주세요.` };
  if (head.size > MAX_UPLOAD_BYTES) return { error: `'${row.name}' 은(는) 20MB 를 넘습니다.` };
  if (await looksEncryptedPdfAt(row.key, head.size, row.name))
    return { error: `'${row.name}' 은(는) 암호화(DRM)된 PDF 라 RCMS 에 올릴 수 없습니다. 암호를 해제한 파일을 올려주세요.` };
  return { size: head.size };
}

type StoreContext = NamingContext & { taken: Set<string> };

/** 파일명 규칙에 필요한 거래 정보 + 이미 쓰인 첨부 이름 */
async function namingContext(transactionId: string): Promise<StoreContext> {
  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: {
      seqNo: true,
      vendor: true,
      budgetItem: { select: { name: true } },
      attachments: { select: { fileName: true } },
    },
  });
  return {
    seqNo: tx?.seqNo ?? null,
    vendor: tx?.vendor ?? null,
    budgetItem: tx?.budgetItem?.name ?? null,
    taken: new Set((tx?.attachments ?? []).map((a) => a.fileName)),
  };
}

/** 저장 — staging 객체를 attachments/ 로 옮기고, 표시 이름은 "연번-증빙종류-거래처-비목.ext" 규칙으로, 원본 이름은 originalName 에 보관 */
async function storeAttachment(transactionId: string, ctx: StoreContext, row: EvidenceRow) {
  const originalName = normalizeFileName(row.name);
  const fileName = pickEvidenceFileName(ctx, row.code, originalName, ctx.taken);
  const { storedName, size } = await promoteStaged(row.key, originalName, row.type);
  await prisma.attachment.create({
    data: { transactionId, fileName, originalName, storedName, mimeType: row.type || null, size, evidenceCode: row.code },
  });
}

// ---------- 거래 ----------

export async function createTransaction(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const projectId = idOf(fd.get("projectId"));
  const projectYearId = idOf(fd.get("projectYearId"));
  if (!projectId || !projectYearId) return { error: "잘못된 연차입니다." };

  const raw = parseTx(fd);
  const parsed = parseItems(raw.items);
  const fieldErrors = validateTx(raw, parsed.items);
  if (parsed.error) fieldErrors.items = parsed.error;

  // 함께 올린 증빙 — 거래를 만들기 전에 전부 검증해 반쪽 저장을 막는다
  const picked = pickEvidenceRows(fd);
  if (picked.error) fieldErrors.evidenceFile = picked.error;
  for (const row of picked.rows) {
    const c = await checkEvidence(row);
    if ("error" in c) {
      fieldErrors.evidenceFile = c.error;
      break;
    }
  }
  if (Object.keys(fieldErrors).length) return { fieldErrors, values: raw };

  const cat = await resolveCategory(raw);
  const money = deriveMoney(raw, parsed.items);
  const tx = await prisma.transaction.create({
    data: {
      projectYearId,
      seqNo: await nextSeqNo(projectYearId),
      ...txData(raw, cat, money),
      items: { create: itemRows(parsed.items) },
    },
  });
  const ctx = await namingContext(tx.id);
  for (const row of picked.rows) await storeAttachment(tx.id, ctx, row);

  revalidatePath(ledgerPath(projectId, projectYearId));
  revalidatePath(`/projects/${projectId}`);
  return { values: {}, nonce: Date.now() }; // 폼 초기화(연속 입력)
}

export async function updateTransaction(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const id = idOf(fd.get("id"));
  const projectId = idOf(fd.get("projectId"));
  const projectYearId = idOf(fd.get("projectYearId"));
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
  await renameAttachmentsFor(prisma, id); // 거래처·비목 변경을 첨부 파일명에 반영
  revalidatePath(ledgerPath(projectId, projectYearId));
  revalidatePath(`/projects/${projectId}`);
  redirect(`${ledgerPath(projectId, projectYearId)}?tx=${id}#detail`); // 원장으로 돌아가되 이 거래를 열어둔다
}

export async function deleteTransaction(fd: FormData): Promise<void> {
  const id = idOf(fd.get("id"));
  const projectId = idOf(fd.get("projectId"));
  const projectYearId = idOf(fd.get("projectYearId"));
  if (!id) return;
  // 첨부·생성PDF 파일도 저장소에서 제거 (DB 레코드는 cascade)
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

/** 거래 수정 화면 — 드롭존에 올린 여러 증빙을 한 번에 거래에 붙인다 */
export async function uploadAttachments(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const transactionId = idOf(fd.get("transactionId"));
  const projectId = idOf(fd.get("projectId"));
  const projectYearId = idOf(fd.get("projectYearId"));
  if (!transactionId || !projectId || !projectYearId) return { error: "잘못된 거래입니다." };

  const picked = pickEvidenceRows(fd);
  if (picked.error) return { fieldErrors: { file: picked.error } };
  if (!picked.rows.length) return { fieldErrors: { file: "파일을 올려주세요." } };

  // 전부 검증한 뒤 저장 — 중간에 실패해 일부만 올라가는 일을 막는다
  for (const row of picked.rows) {
    const c = await checkEvidence(row);
    if ("error" in c) return { fieldErrors: { file: c.error } };
  }
  const ctx = await namingContext(transactionId);
  for (const row of picked.rows) await storeAttachment(transactionId, ctx, row);

  revalidatePath(txEditPath(projectId, projectYearId, transactionId));
  revalidatePath(ledgerPath(projectId, projectYearId));
  return { values: {}, nonce: Date.now() };
}

export async function deleteAttachment(fd: FormData): Promise<void> {
  const id = idOf(fd.get("id"));
  if (!id) return;
  const att = await prisma.attachment.findUnique({ where: { id } });
  if (!att) return;
  await prisma.attachment.delete({ where: { id } });
  await deleteUpload(att.storedName);

  const projectId = idOf(fd.get("projectId"));
  const projectYearId = idOf(fd.get("projectYearId"));
  const transactionId = idOf(fd.get("transactionId"));
  if (projectId && projectYearId && transactionId) {
    revalidatePath(txEditPath(projectId, projectYearId, transactionId));
    revalidatePath(ledgerPath(projectId, projectYearId));
  }
}

// ---------- 서류 생성 ----------
// templateCode: PURCHASE_REQUEST(품의서 텍스트) | PURCHASE_REQUEST_PDF | INSPECTION_CERT(PDF)
//               | EXPENSE_REPORT(지결 연구비) | EXPENSE_REPORT_VAT(지결 부가세, vatAmount>0)

export async function generateDocument(fd: FormData): Promise<void> {
  const transactionId = idOf(fd.get("transactionId"));
  const projectId = idOf(fd.get("projectId"));
  const projectYearId = idOf(fd.get("projectYearId"));
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

  // 같은 종류의 서류는 거래당 하나만 — 다시 만들면 기존 것을 덮어쓴다 (DB 행·S3 PDF 모두 정리)
  const replaceExisting = async () => {
    const olds = await prisma.generatedDocument.findMany({
      where: { transactionId: tx.id, templateCode },
      select: { id: true, filePath: true },
    });
    if (!olds.length) return;
    await prisma.generatedDocument.deleteMany({ where: { id: { in: olds.map((d) => d.id) } } });
    await Promise.all(olds.filter((d) => d.filePath).map((d) => deleteUpload(d.filePath!)));
  };

  switch (templateCode) {
    case "PURCHASE_REQUEST":
      await replaceExisting();
      await prisma.generatedDocument.create({
        data: { ...base, format: "text", content: renderPurchaseRequest(ctx) },
      });
      break;
    case "EXPENSE_REPORT":
      await replaceExisting();
      await prisma.generatedDocument.create({
        data: { ...base, format: "text", content: renderExpenseReportSupply(ctx) },
      });
      break;
    case "EXPENSE_REPORT_VAT":
      if (tx.vatAmount <= 0) return;
      await replaceExisting();
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
      await replaceExisting();
      await prisma.generatedDocument.create({ data: { ...base, format: "pdf", filePath: relPath } });
      break;
    }
    case "INSPECTION_CERT": {
      // 검수 사진(INSPECTION_PHOTO 태그 첨부)을 붙임 페이지로 삽입. 사진이 한 장도 없으면 발급하지 않는다 (화면에서도 버튼 비활성)
      const photos = await loadInspectionPhotos(tx);
      if (!photos.length) return;
      const fileName = `inspection-cert-${stamp}.pdf`;
      let relPath: string;
      try {
        ({ relPath } = await renderPdfFile(createElement(InspectionCert, { ctx: buildDocContext(tx, { photos }) }), relDir, fileName));
      } catch (e) {
        // 깨졌거나 미지원(CMYK 등)인 이미지가 섞이면 한 장씩 검사해 그것만 "삽입 불가"로 두고 다시 만든다
        console.error("[inspection-cert] 사진 삽입 실패, 개별 검사 후 재시도:", e instanceof Error ? e.message : e);
        const checked = await Promise.all(
          photos.map(async (p) => (p.data && (await probeImage(p.data)) ? p : { ...p, data: null })),
        );
        ({ relPath } = await renderPdfFile(createElement(InspectionCert, { ctx: buildDocContext(tx, { photos: checked }) }), relDir, fileName));
      }
      await replaceExisting(); // 새 PDF 가 만들어진 뒤에 옛것을 지운다 (실패 시 기존 서류 보존)
      await prisma.generatedDocument.create({ data: { ...base, format: "pdf", filePath: relPath } });
      break;
    }
    default:
      return;
  }
  revalidatePath(txEditPath(projectId, projectYearId, transactionId));
}

export async function deleteDocument(fd: FormData): Promise<void> {
  const id = idOf(fd.get("id"));
  if (!id) return;
  const doc = await prisma.generatedDocument.findUnique({ where: { id } });
  if (!doc) return;
  await prisma.generatedDocument.delete({ where: { id } });
  if (doc.filePath) await deleteUpload(doc.filePath);

  const projectId = idOf(fd.get("projectId"));
  const projectYearId = idOf(fd.get("projectYearId"));
  const transactionId = idOf(fd.get("transactionId"));
  if (projectId && projectYearId && transactionId)
    revalidatePath(txEditPath(projectId, projectYearId, transactionId));
}
