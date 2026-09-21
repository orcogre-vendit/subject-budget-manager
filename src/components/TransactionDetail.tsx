// 거래 상세 — 수정 폼 + 서류 생성 + 증빙 체크리스트 + 첨부. 원장 페이지(행 선택 시 아래 패널)와 수정 페이지가 공유하는 서버 컴포넌트
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ymd, won } from "@/lib/format";
import { humanSize } from "@/lib/uploads";
import { DOC_TEMPLATE_EVIDENCE, evaluateEvidence, evidenceLabel } from "@/lib/evidence";
import { DEFAULT_INSTALL_LOCATION } from "@/lib/documents/context";
import { documentFileName, DOC_FILE_LABELS } from "@/lib/evidenceName";
import { downloadHref } from "@/lib/download";
import TransactionForm, { type BudgetTree } from "@/components/TransactionForm";
import AttachmentUpload from "@/components/AttachmentUpload";
import DocumentsPanel from "@/components/DocumentsPanel";
import DeleteButton from "@/components/DeleteButton";
import {
  updateTransaction,
  uploadAttachments,
  deleteAttachment,
  generateDocument,
  deleteDocument,
} from "@/app/projects/[id]/years/[yearId]/ledger/actions";

export const txDetailInclude = {
  attachments: { orderBy: { uploadedAt: "desc" as const } },
  items: { orderBy: { sortOrder: "asc" as const } },
  documents: { orderBy: { createdAt: "desc" as const } },
  budgetItem: { select: { name: true } },
  budgetSubItem: { include: { evidenceRequirements: { orderBy: { sortOrder: "asc" as const } } } },
  budgetDetailItem: true,
} satisfies Prisma.TransactionInclude;

export type TxDetail = Prisma.TransactionGetPayload<{ include: typeof txDetailInclude }>;

/** 비목 → 세목(증빙 요건 포함) → 세세목 트리. 거래 폼 공용 */
export async function loadBudgetTree(): Promise<BudgetTree> {
  const items = await prisma.budgetItem.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      subItems: {
        orderBy: { name: "asc" },
        include: {
          detailItems: { orderBy: { name: "asc" } },
          evidenceRequirements: {
            select: { code: true, label: true, requirement: true, groupKey: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });
  return items as BudgetTree;
}

const REQ_LABEL: Record<string, string> = { required: "필수", one_of: "택1", optional: "선택" };
const REQ_CLS: Record<string, string> = {
  required: "bg-red-100 text-red-700",
  one_of: "bg-amber-100 text-amber-700",
  optional: "bg-slate-100 text-slate-500",
};

export default function TransactionDetail({
  tx,
  projectId,
  projectYearId,
  budgetTree,
  cancelHref,
}: {
  tx: TxDetail;
  projectId: number;
  projectYearId: number;
  budgetTree: BudgetTree;
  cancelHref: string;
}) {
  const transactionId = tx.id;
  const d = (v: Date | null) => (v ? ymd(v) : "");
  const isOut = tx.direction === "OUT";

  const defaultValues: Record<string, string> = {
    status: tx.status,
    date: ymd(tx.date),
    direction: tx.direction,
    amount: String(tx.amount),
    description: tx.description ?? "",
    budgetItemId: tx.budgetItemId ? String(tx.budgetItemId) : "",
    budgetSubItemName: tx.budgetSubItem?.name ?? "",
    budgetDetailItemName: tx.budgetDetailItem?.name ?? "",
    vatRate: String(tx.vatRate),
    vatAmount: String(tx.vatAmount),
    vendor: tx.vendor ?? "",
    vendorBank: tx.vendorBank ?? "",
    vendorAccount: tx.vendorAccount ?? "",
    vendorHolder: tx.vendorHolder ?? "",
    purpose: tx.purpose ?? "",
    paymentMethod: tx.paymentMethod ?? "RCMS 계좌이체",
    deliveryDate: d(tx.deliveryDate),
    inspectionDate: d(tx.inspectionDate),
    installLocation: tx.installLocation ?? DEFAULT_INSTALL_LOCATION,
    paymentDueDate: d(tx.paymentDueDate),
    items: JSON.stringify(
      tx.items.map((it) => ({ name: it.name, spec: it.spec ?? "", quantity: it.quantity, unitPrice: it.unitPrice })),
    ),
  };

  // 증빙 체크리스트 — 세목 요건 vs (첨부된 evidenceCode + 앱이 생성한 PDF 서류 중 그대로 증빙이 되는 것, 예: 검수확인서)
  const reqs = tx.budgetSubItem?.evidenceRequirements ?? [];
  const attachmentCodes = tx.attachments.map((a) => a.evidenceCode).filter((c): c is string => !!c);
  const docCodes = tx.documents
    .filter((g) => g.format === "pdf" && DOC_TEMPLATE_EVIDENCE[g.templateCode])
    .map((g) => DOC_TEMPLATE_EVIDENCE[g.templateCode]);
  const metByDocOnly = new Set(docCodes.filter((c) => !attachmentCodes.includes(c)));
  const checklist = evaluateEvidence(
    reqs.map((r) => ({ code: r.code, label: r.label, requirement: r.requirement, groupKey: r.groupKey })),
    [...attachmentCodes, ...docCodes],
  );
  const requiredCodes = reqs.filter((r) => r.requirement !== "optional").map((r) => r.code);

  const naming = { seqNo: tx.seqNo, vendor: tx.vendor, budgetItem: tx.budgetItem?.name ?? null };
  const docs = tx.documents.map((g) => ({
    id: g.id,
    templateCode: g.templateCode,
    format: g.format,
    content: g.content,
    createdAt: `${ymd(g.createdAt)} ${g.createdAt.toTimeString().slice(0, 5)}`,
    fileName: documentFileName(naming, DOC_FILE_LABELS[g.templateCode] ?? g.templateCode),
  }));

  return (
    <>
      {isOut && (
        <p className="text-sm text-slate-500">
          공급가액 <b className="text-slate-800">{won(tx.amount)}</b> · 부가세 {won(tx.vatAmount)} · 총액 {won(tx.amount + tx.vatAmount)}
          <span className="ml-2 text-xs text-slate-400">(연구비 잔액에는 공급가액만 반영)</span>
        </p>
      )}

      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-5">
        <TransactionForm
          budgetTree={budgetTree}
          action={updateTransaction}
          submitLabel="저장"
          defaultValues={defaultValues}
          hidden={{ id: tx.id, projectId, projectYearId }}
          cancelHref={cancelHref}
        />
      </div>

      {/* 서류 생성 */}
      <DocumentsPanel
        transactionId={tx.id}
        projectId={projectId}
        projectYearId={projectYearId}
        direction={tx.direction}
        hasVat={tx.vatAmount > 0}
        requiredCodes={requiredCodes}
        photoCount={tx.attachments.filter((a) => a.evidenceCode === "INSPECTION_PHOTO").length}
        hasInspectionDate={!!tx.inspectionDate}
        docs={docs}
        generate={generateDocument}
        remove={deleteDocument}
      />

      {/* 증빙 체크리스트 */}
      {isOut && reqs.length > 0 && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-900">
            증빙 체크리스트 <span className="ml-1 text-xs font-normal text-slate-400">({tx.budgetSubItem?.name})</span>
          </h2>
          {checklist.ok ? (
            <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">필수 증빙이 모두 첨부되었습니다.</p>
          ) : (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              ⚠️ 미충족 필수 증빙: {checklist.missing.join(", ")}
            </p>
          )}
          <ul className="mt-3 space-y-1.5">
            {checklist.rows.map((r) => (
              <li key={r.code} className="flex items-center gap-2 text-sm">
                <span className={r.met ? "text-green-600" : "text-slate-400"}>{r.met ? "✅" : "☐"}</span>
                <span className={r.met ? "text-slate-800" : "text-slate-600"}>{r.label}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${REQ_CLS[r.requirement] ?? REQ_CLS.optional}`}>
                  {REQ_LABEL[r.requirement] ?? r.requirement}
                </span>
                {metByDocOnly.has(r.code) && <span className="text-xs text-slate-400">앱에서 생성한 서류로 충족</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 증빙 첨부 */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-900">증빙 ({tx.attachments.length})</h2>

        {tx.attachments.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100">
            {tx.attachments.map((a) => {
              const isImage = (a.mimeType ?? "").startsWith("image/");
              const viewHref = downloadHref(`/api/attachments/${a.id}`, a.fileName);
              const saveHref = downloadHref(`/api/attachments/${a.id}`, a.fileName, true);
              return (
                <li key={a.id} className="flex items-center gap-3 py-2.5">
                  <a href={viewHref} target="_blank" rel="noopener noreferrer" className="shrink-0">
                    {isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={viewHref} alt={a.fileName} className="h-12 w-12 rounded-lg object-cover ring-1 ring-slate-200" />
                    ) : (
                      <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-xl">📄</span>
                    )}
                  </a>
                  <div className="min-w-0 flex-1">
                    <a href={viewHref} target="_blank" rel="noopener noreferrer"
                      className="block truncate text-sm font-medium text-slate-800 hover:underline">
                      {a.fileName}
                    </a>
                    <p className="text-xs text-slate-400">
                      <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                        {evidenceLabel(a.evidenceCode)}
                      </span>
                      {humanSize(a.size)} · {ymd(a.uploadedAt)}
                      {a.originalName && a.originalName !== a.fileName && (
                        <span className="ml-1.5 text-slate-300">원본 {a.originalName}</span>
                      )}
                    </p>
                  </div>
                  <a href={saveHref} download={a.fileName} className="text-xs font-medium text-slate-600 hover:underline">
                    다운로드
                  </a>
                  <DeleteButton
                    action={deleteAttachment}
                    id={a.id}
                    extra={{ projectId, projectYearId, transactionId }}
                    confirmText={`'${a.fileName}' 증빙을 삭제하시겠습니까?`}
                  />
                </li>
              );
            })}
          </ul>
        )}

        <AttachmentUpload
          action={uploadAttachments}
          hidden={{ transactionId, projectId, projectYearId }}
          suggestedCodes={reqs.map((r) => r.code)}
          naming={{
            seqNo: tx.seqNo,
            vendor: tx.vendor,
            budgetItem: tx.budgetItem?.name ?? null,
            taken: tx.attachments.map((a) => a.fileName),
          }}
        />
      </div>
    </>
  );
}
