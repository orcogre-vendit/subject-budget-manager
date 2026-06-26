import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { won, ymd, executionRate } from "@/lib/format";
import TransactionForm, { type BudgetTree } from "@/components/TransactionForm";
import DeleteButton from "@/components/DeleteButton";
import { createTransaction, deleteTransaction } from "./actions";

export const dynamic = "force-dynamic";

export default async function LedgerPage({
  params,
}: {
  params: Promise<{ id: string; yearId: string }>;
}) {
  const { id, yearId } = await params;
  const projectId = Number(id);
  const projectYearId = Number(yearId);
  if (!projectId || !projectYearId) notFound();

  const [year, transactions, budgetTree] = await Promise.all([
    prisma.projectYear.findUnique({
      where: { id: projectYearId },
      include: { project: { select: { id: true, name: true, code: true } } },
    }),
    prisma.transaction.findMany({
      where: { projectYearId },
      orderBy: [{ date: "asc" }, { id: "asc" }],
      include: {
        budgetItem: { select: { name: true } },
        budgetSubItem: { select: { name: true } },
        budgetDetailItem: { select: { name: true } },
        _count: { select: { attachments: true } },
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

  if (!year || year.projectId !== projectId) notFound();

  // 비목별 입금/출금 집계
  const byItem = new Map<string, { in: number; out: number }>();
  let totalIn = 0;
  let totalOut = 0;
  for (const t of transactions) {
    const key = t.budgetItem?.name ?? "(미분류)";
    const e = byItem.get(key) ?? { in: 0, out: 0 };
    if (t.direction === "IN") {
      e.in += t.amount;
      totalIn += t.amount;
    } else {
      e.out += t.amount;
      totalOut += t.amount;
    }
    byItem.set(key, e);
  }
  const balance = totalIn - totalOut;
  const rate = executionRate(totalOut, year.budgetCash);

  const hidden = { projectId, projectYearId };

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href={`/projects/${projectId}`}
        className="text-sm text-slate-400 hover:text-slate-700"
      >
        ← {year.project.name}
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">
        집행 원장 — {year.yearNo}년차
        {year.label ? (
          <span className="ml-2 text-base font-normal text-slate-400">
            {year.label}
          </span>
        ) : null}
      </h1>

      {/* 요약 카드 */}
      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">편성예산</p>
          <p className="mt-1 text-lg font-bold text-slate-900">
            {won(year.budgetCash)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">총 입금</p>
          <p className="mt-1 text-lg font-bold text-blue-600">{won(totalIn)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">총 출금(집행)</p>
          <p className="mt-1 text-lg font-bold text-red-600">{won(totalOut)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">잔액 · 집행률</p>
          <p className="mt-1 text-lg font-bold text-slate-900">
            {won(balance)}
            <span className="ml-2 text-sm font-medium text-slate-400">
              {rate}%
            </span>
          </p>
        </div>
      </div>

      {/* 비목별 잔액 */}
      {byItem.size > 0 && (
        <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-2.5 font-medium">비목</th>
                <th className="px-4 py-2.5 text-right font-medium">입금</th>
                <th className="px-4 py-2.5 text-right font-medium">출금</th>
                <th className="px-4 py-2.5 text-right font-medium">잔액</th>
              </tr>
            </thead>
            <tbody>
              {[...byItem.entries()].map(([name, e]) => (
                <tr key={name} className="border-b border-slate-100">
                  <td className="px-4 py-2.5 font-medium text-slate-800">
                    {name}
                  </td>
                  <td className="px-4 py-2.5 text-right text-blue-600">
                    {won(e.in)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-red-600">
                    {won(e.out)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-slate-900">
                    {won(e.in - e.out)}
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-semibold">
                <td className="px-4 py-2.5 text-slate-800">합계</td>
                <td className="px-4 py-2.5 text-right text-blue-600">
                  {won(totalIn)}
                </td>
                <td className="px-4 py-2.5 text-right text-red-600">
                  {won(totalOut)}
                </td>
                <td className="px-4 py-2.5 text-right text-slate-900">
                  {won(balance)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* 거래 내역 */}
      <h2 className="mt-8 text-lg font-bold text-slate-900">
        거래 내역 ({transactions.length})
      </h2>
      {transactions.length === 0 ? (
        <p className="mt-3 rounded-lg bg-slate-100 px-4 py-6 text-center text-sm text-slate-500">
          집행 내역이 없습니다. 아래에서 거래를 입력하세요.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-3 py-2.5 font-medium">날짜</th>
                <th className="px-3 py-2.5 font-medium">상태</th>
                <th className="px-3 py-2.5 font-medium">분류</th>
                <th className="px-3 py-2.5 font-medium">적요</th>
                <th className="px-3 py-2.5 text-center font-medium">증빙</th>
                <th className="px-3 py-2.5 text-right font-medium">금액</th>
                <th className="px-3 py-2.5 text-right font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => {
                const cat = [
                  t.budgetItem?.name,
                  t.budgetSubItem?.name,
                  t.budgetDetailItem?.name,
                ]
                  .filter(Boolean)
                  .join(" › ");
                const isIn = t.direction === "IN";
                return (
                  <tr
                    key={t.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                      {ymd(t.date)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs ${
                          t.status === "완료"
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      {cat || "-"}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">
                      {t.description ?? "-"}
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-slate-500">
                      {t._count.attachments > 0
                        ? `📎 ${t._count.attachments}`
                        : "-"}
                    </td>
                    <td
                      className={`whitespace-nowrap px-3 py-2.5 text-right font-medium ${
                        isIn ? "text-blue-600" : "text-red-600"
                      }`}
                    >
                      {isIn ? "+" : "−"}
                      {won(t.amount)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          href={`/projects/${projectId}/years/${projectYearId}/ledger/${t.id}/edit`}
                          className="text-xs font-medium text-slate-600 hover:underline"
                        >
                          수정
                        </Link>
                        <DeleteButton
                          action={deleteTransaction}
                          id={t.id}
                          extra={hidden}
                          confirmText="이 거래를 삭제하시겠습니까?"
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 거래 추가 */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-900">거래 추가</h2>
        <TransactionForm
          budgetTree={budgetTree as BudgetTree}
          action={createTransaction}
          submitLabel="거래 등록"
          hidden={hidden}
        />
      </div>
    </div>
  );
}
