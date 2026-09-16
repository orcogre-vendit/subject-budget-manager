import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { seqLabel } from "@/lib/evidenceName";
import TransactionDetail, { txDetailInclude, loadBudgetTree } from "@/components/TransactionDetail";

export const dynamic = "force-dynamic";

/** 거래 단독 페이지 — 원장에서 행을 고르면 같은 내용이 원장 아래 패널로도 열린다 */
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
    prisma.transaction.findUnique({ where: { id: transactionId }, include: txDetailInclude }),
    loadBudgetTree(),
  ]);
  if (!tx || tx.projectYearId !== projectYearId) notFound();

  const ledgerHref = `/projects/${projectId}/years/${projectYearId}/ledger`;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={ledgerHref} className="text-sm text-slate-400 hover:text-slate-700">
        ← 집행 원장
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">
        거래 수정 <span className="ml-1 font-mono text-lg font-medium text-slate-400">No. {seqLabel(tx.seqNo)}</span>
      </h1>
      <div className="mt-1">
        <TransactionDetail tx={tx} projectId={projectId} projectYearId={projectYearId} budgetTree={budgetTree} cancelHref={ledgerHref} />
      </div>
    </div>
  );
}
