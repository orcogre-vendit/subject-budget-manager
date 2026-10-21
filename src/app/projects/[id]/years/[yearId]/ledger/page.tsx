import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { idOf } from "@/lib/ids";
import { won, ymd, executionRate } from "@/lib/format";
import { allocationOf, spendingOf } from "@/lib/budget";
import { seqLabel } from "@/lib/evidenceName";
import TransactionForm from "@/components/TransactionForm";
import TransactionDetail, { txDetailInclude, loadBudgetTree } from "@/components/TransactionDetail";
import ClickableRow from "@/components/ClickableRow";
import DeleteButton from "@/components/DeleteButton";
import ShareTransactionLink from "@/components/ShareTransactionLink";
import { createTransaction, deleteTransaction } from "./actions";

export const dynamic = "force-dynamic";

export default async function LedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; yearId: string }>;
  searchParams: Promise<{ tx?: string }>;
}) {
  const { id, yearId } = await params;
  const { tx: txParam } = await searchParams;
  const projectId = idOf(id);
  const projectYearId = idOf(yearId);
  if (!projectId || !projectYearId) notFound();
  const selectedId = idOf(txParam); // ?tx=ID → 해당 거래 상세를 아래 패널에 연다

  const [year, transactions, budgetTree, selected] = await Promise.all([
    prisma.projectYear.findUnique({
      where: { id: projectYearId },
      include: { project: { select: { id: true, name: true, code: true } } },
    }),
    prisma.transaction.findMany({
      where: { projectYearId },
      orderBy: [{ date: "asc" }, { seqNo: "asc" }],
      include: {
        budgetItem: { select: { name: true } },
        budgetSubItem: { select: { name: true } },
        budgetDetailItem: { select: { name: true } },
        _count: { select: { attachments: true } },
        rcmsRecord: { select: { id: true, progress: true, missingSince: true } },
      },
    }),
    loadBudgetTree(),
    selectedId
      ? prisma.transaction.findUnique({ where: { id: selectedId }, include: txDetailInclude })
      : Promise.resolve(null),
  ]);

  if (!year || year.projectId !== projectId) notFound();
  const detail = selected && selected.projectYearId === projectYearId ? selected : null;
  const ledgerHref = `/projects/${projectId}/years/${projectYearId}/ledger`;
  const detailHref = (txId: string) => `${ledgerHref}?tx=${txId}#detail`;

  // 비목별 입금/출금 집계
  const byItem = new Map<string, { in: number; out: number }>();
  let totalIn = 0;
  let totalOut = 0;
  for (const t of transactions) {
    if (t.status === "취소") continue; // 취소 거래는 잔액 집계 제외
    const key = t.budgetItem?.name ?? "(미분류)";
    const e = byItem.get(key) ?? { in: 0, out: 0 };
    // 입금 = 편성(조정 포함, 감액 조정은 −), 출금 = 실제 집행만
    const alloc = allocationOf(t);
    const spent = spendingOf(t);
    e.in += alloc;
    totalIn += alloc;
    e.out += spent;
    totalOut += spent;
    byItem.set(key, e);
  }
  const balance = totalIn - totalOut;
  const rate = executionRate(totalOut, year.budgetCash);
  // 다음 거래가 받을 연번 — 첨부 파일명 미리보기("03-거래명세서-…")용. 실제 부여는 서버가 저장 시점에 다시 계산
  const nextSeqNo = transactions.reduce((m, t) => Math.max(m, t.seqNo ?? 0), 0) + 1;

  const hidden = { projectId, projectYearId };
  // 부가세(회사 부담분)를 연구비 전용계좌에 아직 넣어야 하는 건 — 출금·부가세 있음·완료 전
  const vatPending = (t: { direction: string; status: string; vatAmount: number; budgetAdjust: boolean | null }) =>
    t.direction === "OUT" && !t.budgetAdjust && t.vatAmount > 0 && t.status !== "완료" && t.status !== "취소";
  const vatPendingCount = transactions.filter(vatPending).length;
  const vatPendingSum = transactions.filter(vatPending).reduce((s, t) => s + t.vatAmount, 0);

  return (
    <div className="mx-auto min-w-0 w-full max-w-6xl">
      <Link
        href={`/projects/${projectId}`}
        className="text-sm text-slate-400 hover:text-slate-700"
      >
        ← {year.project.name}
      </Link>
      <h1 className="mt-2 break-keep text-2xl font-bold text-slate-900">
        집행 원장 — {year.yearNo}년차
        {year.label ? (
          <span className="ml-2 text-base font-normal text-slate-400">
            {year.label}
          </span>
        ) : null}
      </h1>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          href={`/projects/${projectId}/years/${projectYearId}/budget`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
        >
          📊 예산표 보기
        </Link>
        {year.ledgerType === "PROJECT" && (
          <Link
            href={`/rcms/${projectYearId}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            🔁 RCMS 대조표
          </Link>
        )}
      </div>
      {year.ledgerType === "PROJECT" && (
        <p className="mt-2 text-xs text-slate-400">출금은 품의로 입력하고, 실집행액은 RCMS 엑셀 가져오기로 반영됩니다.</p>
      )}

      {/* 요약 카드 */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">편성예산</p>
          <p className="mt-1 text-lg font-bold text-slate-900">
            {won(year.budgetCash)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">총 편성(입금±조정)</p>
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
        <div className="mt-5 max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white">
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
      {transactions.length > 0 && !detail && (
        <p className="mt-1 text-xs text-slate-400">행을 누르면 아래에 상세(수정·서류·증빙)가 열립니다.</p>
      )}
      {vatPendingCount > 0 && (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          💰 부가세 입금 필요 {vatPendingCount}건 · 합계 {won(vatPendingSum)} — 완료 전인 출금 건의 회사 부담분(부가세)을 법인계좌에서 연구비 전용계좌로 넣어야 RCMS 이체가 됩니다. 아래 목록에서 주황 배지로 표시됩니다.
        </p>
      )}
      {transactions.length === 0 ? (
        <p className="mt-3 rounded-lg bg-slate-100 px-4 py-6 text-center text-sm text-slate-500">
          집행 내역이 없습니다. 아래에서 거래를 입력하세요.
        </p>
      ) : (
        <>
        <div className="mt-3 hidden max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
          <table className="min-w-[1024px] w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[50px]" />
              <col className="w-[120px]" />
              <col className="w-[112px]" />
              <col className="w-[260px]" />
              <col />
              <col className="w-[80px]" />
              <col className="w-[150px]" />
              <col className="w-[130px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-3 py-2.5 font-medium">No</th>
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
                const isCancelled = t.status === "취소";
                return (
                  <ClickableRow key={t.id} href={detailHref(t.id)} selected={t.id === detail?.id} tone={vatPending(t) ? "warn" : "default"}>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-slate-500">
                      {seqLabel(t.seqNo)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                      {ymd(t.date)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs ${
                          t.status === "완료"
                            ? "bg-green-100 text-green-700"
                            : t.status === "취소"
                              ? "bg-slate-200 text-slate-500"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {t.status}
                      </span>
                      {t.rcmsRecord && (
                        <span
                          className={`mt-1 block w-fit rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            t.rcmsRecord.missingSince
                              ? "bg-green-100 text-green-700"
                              : t.rcmsRecord.progress === "임시저장"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-blue-100 text-blue-700"
                          }`}
                          title="RCMS 사용등록 건과 연결됨"
                        >
                          RCMS {t.rcmsRecord.missingSince ? "이체완료" : t.rcmsRecord.progress ?? "등록"}
                        </span>
                      )}
                    </td>
                    <td className="break-keep px-3 py-2.5 text-xs text-slate-600">
                      {cat || "-"}
                    </td>
                    <td className="break-keep px-3 py-2.5 text-slate-700">
                      {t.description ?? "-"}
                      {t.budgetAdjust && (
                        <span className="mt-1 block w-fit whitespace-nowrap rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                          편성 조정 · {t.direction === "IN" ? "증액" : "감액"} (집행 아님)
                        </span>
                      )}
                      {vatPending(t) && (
                        <span
                          className="mt-1 block w-fit whitespace-nowrap rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700"
                          title="회사 부담분 부가세를 법인계좌에서 연구비 전용계좌로 입금해야 합니다 (지출결의-부가세)"
                        >
                          💰 부가세 {won(t.vatAmount)} 입금 필요
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-slate-500">
                      {t._count.attachments > 0
                        ? `📎 ${t._count.attachments}`
                        : "-"}
                    </td>
                    <td
                      className={`whitespace-nowrap px-3 py-2.5 text-right font-medium ${
                        isCancelled
                          ? "text-slate-400 line-through"
                          : t.budgetAdjust
                            ? "text-violet-600"
                            : isIn
                              ? "text-blue-600"
                              : "text-red-600"
                      }`}
                    >
                      {isIn ? "+" : "−"}
                      {won(t.amount)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link href={detailHref(t.id)} className="text-xs font-medium text-slate-600 hover:underline">
                          열기
                        </Link>
                        <ShareTransactionLink
                          href={detailHref(t.id)}
                          title={`${year.project.name} · No. ${seqLabel(t.seqNo)} ${t.description ?? t.vendor ?? "거래내역"}`}
                          compact
                        />
                        <DeleteButton
                          action={deleteTransaction}
                          id={t.id}
                          extra={hidden}
                          confirmText="이 거래를 삭제하시겠습니까?"
                        />
                      </div>
                    </td>
                  </ClickableRow>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 space-y-3 md:hidden">
          {transactions.map((t) => {
            const cat = [t.budgetItem?.name, t.budgetSubItem?.name, t.budgetDetailItem?.name].filter(Boolean).join(" › ");
            const isIn = t.direction === "IN";
            const isCancelled = t.status === "취소";
            return (
              <article key={t.id} className={`rounded-xl border p-4 ${t.id === detail?.id ? "border-amber-300 bg-amber-50" : vatPending(t) ? "border-orange-200 bg-orange-50/40" : "border-slate-200 bg-white"}`}>
                <Link href={detailHref(t.id)} className="block">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="font-mono text-xs text-slate-400">No. {seqLabel(t.seqNo)}</span>
                      <span className={`rounded px-1.5 py-0.5 text-xs ${t.status === "완료" ? "bg-green-100 text-green-700" : t.status === "취소" ? "bg-slate-200 text-slate-500" : "bg-amber-100 text-amber-700"}`}>{t.status}</span>
                      {t.rcmsRecord && (
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${t.rcmsRecord.missingSince ? "bg-green-100 text-green-700" : t.rcmsRecord.progress === "임시저장" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                          RCMS {t.rcmsRecord.missingSince ? "이체완료" : t.rcmsRecord.progress ?? "등록"}
                        </span>
                      )}
                      {t.budgetAdjust && (
                        <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">편성 {t.direction === "IN" ? "증액" : "감액"}</span>
                      )}
                      {vatPending(t) && (
                        <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">💰 부가세 {won(t.vatAmount)} 입금 필요</span>
                      )}
                    </div>
                    <span className={`whitespace-nowrap text-sm font-bold sm:shrink-0 ${isCancelled ? "text-slate-400 line-through" : t.budgetAdjust ? "text-violet-600" : isIn ? "text-blue-600" : "text-red-600"}`}>
                      {isIn ? "+" : "−"}{won(t.amount)}
                    </span>
                  </div>
                  <p className="mt-3 break-keep text-sm font-medium leading-6 text-slate-800">{t.description ?? "적요 없음"}</p>
                  <p className="mt-1 break-keep text-xs leading-5 text-slate-500">{cat || "미분류"}</p>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                    <span>{ymd(t.date)}</span>
                    <span>{t._count.attachments > 0 ? `📎 증빙 ${t._count.attachments}개` : "증빙 없음"}</span>
                  </div>
                </Link>
                <div className="mt-3 flex items-center gap-4 border-t border-slate-100 pt-3">
                  <Link href={detailHref(t.id)} className="text-xs font-semibold text-slate-700">상세 열기</Link>
                  <ShareTransactionLink
                    href={detailHref(t.id)}
                    title={`${year.project.name} · No. ${seqLabel(t.seqNo)} ${t.description ?? t.vendor ?? "거래내역"}`}
                    compact
                  />
                  <DeleteButton action={deleteTransaction} id={t.id} extra={hidden} confirmText="이 거래를 삭제하시겠습니까?" />
                </div>
              </article>
            );
          })}
        </div>
        </>
      )}

      {/* 아래 패널: 행을 고르면 그 거래의 상세(수정·서류·증빙), 아니면 거래 추가 */}
      <div id="detail" className="mt-6 scroll-mt-4">
        {detail ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-slate-900">
                <span className="font-mono text-slate-400">No. {seqLabel(detail.seqNo)}</span>
                <span className="ml-2">{detail.description ?? detail.vendor ?? "거래 상세"}</span>
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <ShareTransactionLink
                  href={detailHref(detail.id)}
                  title={`${year.project.name} · No. ${seqLabel(detail.seqNo)} ${detail.description ?? detail.vendor ?? "거래내역"}`}
                />
                <Link href={ledgerHref} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100">
                  ✕ 닫고 새 거래 추가
                </Link>
              </div>
            </div>
            <div className="mt-2">
              <TransactionDetail tx={detail} projectId={projectId} projectYearId={projectYearId} budgetTree={budgetTree} cancelHref={ledgerHref} />
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-900">거래 추가</h2>
            <TransactionForm
              budgetTree={budgetTree}
              action={createTransaction}
              submitLabel="거래 등록"
              hidden={hidden}
              withEvidence
              nextSeqNo={nextSeqNo}
            />
          </div>
        )}
      </div>
    </div>
  );
}
