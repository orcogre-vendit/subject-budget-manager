import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ymd } from "@/lib/format";
import { humanSize } from "@/lib/uploads";
import TransactionForm, { type BudgetTree } from "@/components/TransactionForm";
import AttachmentUpload from "@/components/AttachmentUpload";
import DeleteButton from "@/components/DeleteButton";
import {
  updateTransaction,
  uploadAttachment,
  deleteAttachment,
} from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditTransactionPage({
  params,
}: {
  params: Promise<{ id: string; yearId: string; txId: string }>;
}) {
  const { id, yearId, txId } = await params;
  const projectId = Number(id);
  const projectYearId = Number(yearId);
  const transactionId = Number(txId);
  if (!projectId || !projectYearId || !transactionId) notFound();

  const [tx, budgetTree] = await Promise.all([
    prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        attachments: { orderBy: { uploadedAt: "desc" } },
        budgetSubItem: true,
        budgetDetailItem: true,
      },
    }),
    prisma.budgetItem.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        subItems: {
          orderBy: { name: "asc" },
          include: { detailItems: { orderBy: { name: "asc" } } },
        },
      },
    }),
  ]);

  if (!tx || tx.projectYearId !== projectYearId) notFound();

  const ledgerHref = `/projects/${projectId}/years/${projectYearId}/ledger`;

  const defaultValues: Record<string, string> = {
    status: tx.status,
    date: ymd(tx.date),
    direction: tx.direction,
    amount: String(tx.amount),
    description: tx.description ?? "",
    budgetItemId: tx.budgetItemId ? String(tx.budgetItemId) : "",
    budgetSubItemName: tx.budgetSubItem?.name ?? "",
    budgetDetailItemName: tx.budgetDetailItem?.name ?? "",
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={ledgerHref}
        className="text-sm text-slate-400 hover:text-slate-700"
      >
        ← 집행 원장
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">거래 수정</h1>
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <TransactionForm
          budgetTree={budgetTree as BudgetTree}
          action={updateTransaction}
          submitLabel="저장"
          defaultValues={defaultValues}
          hidden={{ id: tx.id, projectId, projectYearId }}
          cancelHref={ledgerHref}
        />
      </div>

      {/* 증빙 첨부 */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-900">
          증빙 ({tx.attachments.length})
        </h2>

        {tx.attachments.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100">
            {tx.attachments.map((a) => {
              const isImage = (a.mimeType ?? "").startsWith("image/");
              return (
                <li key={a.id} className="flex items-center gap-3 py-2.5">
                  <a
                    href={`/api/attachments/${a.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0"
                  >
                    {isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/attachments/${a.id}`}
                        alt={a.fileName}
                        className="h-12 w-12 rounded-lg object-cover ring-1 ring-slate-200"
                      />
                    ) : (
                      <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-xl">
                        📄
                      </span>
                    )}
                  </a>
                  <div className="min-w-0 flex-1">
                    <a
                      href={`/api/attachments/${a.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm font-medium text-slate-800 hover:underline"
                    >
                      {a.fileName}
                    </a>
                    <p className="text-xs text-slate-400">
                      {humanSize(a.size)} · {ymd(a.uploadedAt)}
                    </p>
                  </div>
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
          action={uploadAttachment}
          hidden={{ transactionId, projectId, projectYearId }}
        />
      </div>
    </div>
  );
}
