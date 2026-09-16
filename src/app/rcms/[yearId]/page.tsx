import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { won, ymd } from "@/lib/format";
import { yearInclude } from "@/lib/rcms/db";
import { buildItemRows, buildWarnings, candidates, txBudgetPath, type TxLite } from "@/lib/rcms/match";
import { matchRecord, unmatchRecord, createTransactionFromRecord } from "../actions";

export const dynamic = "force-dynamic";

const LEVEL_CLS = {
  danger: "bg-red-50 text-red-800 border-red-200",
  warn: "bg-amber-50 text-amber-800 border-amber-200",
  info: "bg-slate-50 text-slate-700 border-slate-200",
};
const LEVEL_ICON = { danger: "🔴", warn: "⚠️", info: "ℹ️" };

function RecStatus({ progress, missingSince }: { progress: string | null; missingSince: Date | null }) {
  if (missingSince) return <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">이체완료(추정)</span>;
  if (progress === "임시저장") return <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">임시저장</span>;
  return <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">{progress ?? "등록"}</span>;
}

export default async function RcmsYearPage({ params }: { params: Promise<{ yearId: string }> }) {
  const { yearId } = await params;
  const id = Number(yearId);
  if (!id) notFound();

  const year = await prisma.projectYear.findUnique({ where: { id }, include: yearInclude });
  if (!year) notFound();

  const records = year.rcmsRecords;
  const txs = year.transactions;
  const items = buildItemRows(txs, records);
  const warnings = buildWarnings(txs, records, items);

  const matchedTxIds = new Set(records.map((r) => r.transactionId).filter((v): v is number => v !== null));
  const pendingTxs = txs.filter((t) => t.direction === "OUT" && t.status !== "취소" && !matchedTxIds.has(t.id));
  const matched = records.filter((r) => r.transactionId);
  const unmatched = records.filter((r) => !r.transactionId);

  const rcmsTotal = records.reduce((s, r) => s + r.supplyAmount, 0);
  const pendingTotal = pendingTxs.reduce((s, t) => s + t.amount, 0);
  const available = year.budgetCash - rcmsTotal - pendingTotal;
  const ledgerHref = `/projects/${year.project.id}/years/${year.id}/ledger`;
  const editHref = (txId: number) => `${ledgerHref}/${txId}/edit`;
  const txLabel = (t: TxLite) => `${ymd(t.date)} · ${t.description ?? t.vendor ?? "-"} · ${won(t.amount)}`;
  const hidden = (recordId: number) => (
    <>
      <input type="hidden" name="recordId" value={recordId} />
      <input type="hidden" name="yearId" value={year.id} />
    </>
  );

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/rcms" className="text-sm text-slate-400 hover:text-slate-700">← RCMS 대조</Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">
        RCMS 대조표 — {year.project.name} <span className="text-base font-normal text-slate-400">{year.yearNo}년차</span>
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        <Link href={ledgerHref} className="underline hover:text-slate-800">📒 집행 원장</Link>
        <span className="mx-2">·</span>과제코드 {year.project.code ?? "-"}
      </p>

      {/* 요약 */}
      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">편성예산</p><p className="mt-1 text-lg font-bold text-slate-900">{won(year.budgetCash)}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">RCMS 등록(공급가)</p><p className="mt-1 text-lg font-bold text-red-600">{won(rcmsTotal)}</p><p className="text-xs text-slate-400">{records.length}건 · 매칭 {matched.length}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">미등록 품의(약정)</p><p className="mt-1 text-lg font-bold text-amber-700">{won(pendingTotal)}</p><p className="text-xs text-slate-400">{pendingTxs.length}건</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">가용잔액 = 편성 − RCMS − 약정</p><p className={`mt-1 text-lg font-bold ${available < 0 ? "text-red-700" : "text-slate-900"}`}>{won(available)}</p></div>
      </div>

      {/* 경고 */}
      {warnings.length > 0 && (
        <div className="mt-5 space-y-1.5">
          {warnings.map((w, i) => (
            <div key={i} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${LEVEL_CLS[w.level]}`}>
              <span>{LEVEL_ICON[w.level]}</span>
              <span className="flex-1">{w.message}</span>
              {w.txId && <Link href={editHref(w.txId)} className="shrink-0 text-xs underline">거래 보기</Link>}
            </div>
          ))}
        </div>
      )}

      {/* 비목별 */}
      {items.length > 0 && (
        <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-2.5 font-medium">비목</th>
                <th className="px-4 py-2.5 text-right font-medium">편성(입금)</th>
                <th className="px-4 py-2.5 text-right font-medium">RCMS 등록</th>
                <th className="px-4 py-2.5 text-right font-medium">미등록 품의</th>
                <th className="px-4 py-2.5 text-right font-medium">가용잔액</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.name} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{it.name}</td>
                  <td className="px-4 py-2.5 text-right text-blue-600">{won(it.allocated)}</td>
                  <td className="px-4 py-2.5 text-right text-red-600">{won(it.rcms)}</td>
                  <td className="px-4 py-2.5 text-right text-amber-700">{won(it.pending)}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${it.available < 0 ? "text-red-700" : "text-slate-900"}`}>{won(it.available)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* RCMS 에만 있는 건 */}
      <h2 className="mt-8 text-lg font-bold text-slate-900">RCMS 등록 · 품의 미연결 ({unmatched.length})</h2>
      {unmatched.length === 0 ? (
        <p className="mt-3 rounded-lg bg-slate-100 px-4 py-4 text-center text-sm text-slate-500">모든 RCMS 건이 장부와 연결되어 있습니다.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-3 py-2.5 font-medium">사용일</th>
                <th className="px-3 py-2.5 font-medium">상태</th>
                <th className="px-3 py-2.5 font-medium">비목정보</th>
                <th className="px-3 py-2.5 font-medium">거래처 / 품목</th>
                <th className="px-3 py-2.5 text-right font-medium">공급가</th>
                <th className="px-3 py-2.5 text-right font-medium">부가세</th>
                <th className="px-3 py-2.5 font-medium">연결</th>
              </tr>
            </thead>
            <tbody>
              {unmatched.map((r) => {
                const cs = candidates(r, pendingTxs);
                const candidateIds = new Set(cs.map((c) => c.tx.id));
                const others = pendingTxs.filter((t) => !candidateIds.has(t.id));
                return (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0 align-top">
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{r.useDate ? ymd(r.useDate) : "-"}</td>
                    <td className="px-3 py-2.5"><RecStatus progress={r.progress} missingSince={r.missingSince} /><p className="mt-0.5 text-[10px] text-slate-400">{r.evidenceType ?? ""}</p></td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">{r.budgetPath ?? "-"}</td>
                    <td className="px-3 py-2.5"><p className="text-slate-800">{r.vendor ?? "-"}</p><p className="text-xs text-slate-500">{r.itemName ?? ""}</p></td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium text-red-600">{won(r.supplyAmount)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-slate-500">{won(r.vatAmount)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col gap-1.5">
                        {pendingTxs.length > 0 && (
                          <form action={matchRecord} className="flex items-center gap-1.5">
                            {hidden(r.id)}
                            <select name="transactionId" defaultValue={cs[0]?.tx.id ?? ""} className="w-64 rounded-md border border-slate-300 px-2 py-1 text-xs">
                              <option value="">품의 선택</option>
                              {cs.length > 0 && (
                                <optgroup label="금액 일치 후보">
                                  {cs.map((c) => <option key={c.tx.id} value={c.tx.id}>{txLabel(c.tx)} (점수 {c.score})</option>)}
                                </optgroup>
                              )}
                              {others.length > 0 && (
                                <optgroup label="기타 미등록 품의">
                                  {others.map((t) => <option key={t.id} value={t.id}>{txLabel(t)}</option>)}
                                </optgroup>
                              )}
                            </select>
                            <button type="submit" className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100">매칭</button>
                          </form>
                        )}
                        <form action={createTransactionFromRecord}>
                          {hidden(r.id)}
                          <button type="submit" className="rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-700">장부에 거래 생성</button>
                          <span className="ml-1.5 text-[10px] text-slate-400">품의 없이 집행된 건</span>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 미등록 품의 */}
      <h2 className="mt-8 text-lg font-bold text-slate-900">품의 · RCMS 미등록 ({pendingTxs.length})</h2>
      {pendingTxs.length === 0 ? (
        <p className="mt-3 rounded-lg bg-slate-100 px-4 py-4 text-center text-sm text-slate-500">RCMS 에 등록되지 않은 품의가 없습니다.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-3 py-2.5 font-medium">품의일</th>
                <th className="px-3 py-2.5 font-medium">상태</th>
                <th className="px-3 py-2.5 font-medium">분류</th>
                <th className="px-3 py-2.5 font-medium">적요 / 거래처</th>
                <th className="px-3 py-2.5 text-right font-medium">공급가</th>
                <th className="px-3 py-2.5 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {pendingTxs.map((t) => (
                <tr key={t.id} className="border-b border-slate-100 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{ymd(t.date)}</td>
                  <td className="px-3 py-2.5"><span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">{t.status}</span></td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">{txBudgetPath(t)}</td>
                  <td className="px-3 py-2.5"><p className="text-slate-800">{t.description ?? "-"}</p><p className="text-xs text-slate-500">{t.vendor ?? ""}</p></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium text-amber-700">{won(t.amount)}</td>
                  <td className="px-3 py-2.5 text-right"><Link href={editHref(t.id)} className="text-xs font-medium text-slate-600 hover:underline">거래 보기</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 매칭됨 */}
      <h2 className="mt-8 text-lg font-bold text-slate-900">연결됨 ({matched.length})</h2>
      {matched.length === 0 ? (
        <p className="mt-3 rounded-lg bg-slate-100 px-4 py-4 text-center text-sm text-slate-500">아직 연결된 건이 없습니다.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-3 py-2.5 font-medium">사용일</th>
                <th className="px-3 py-2.5 font-medium">RCMS 상태</th>
                <th className="px-3 py-2.5 font-medium">RCMS 거래처 / 품목</th>
                <th className="px-3 py-2.5 font-medium">장부 거래</th>
                <th className="px-3 py-2.5 text-right font-medium">품의 → 실집행</th>
                <th className="px-3 py-2.5 text-right font-medium">부가세</th>
                <th className="px-3 py-2.5 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {matched.map((r) => {
                const t = r.transaction;
                return (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{r.useDate ? ymd(r.useDate) : "-"}</td>
                    <td className="px-3 py-2.5"><RecStatus progress={r.progress} missingSince={r.missingSince} /><p className="mt-0.5 text-[10px] text-slate-400">{r.matchMethod === "auto" ? "자동" : r.matchMethod === "created" ? "RCMS에서 생성" : "수동"}</p></td>
                    <td className="px-3 py-2.5"><p className="text-slate-800">{r.vendor ?? "-"}</p><p className="text-xs text-slate-500">{r.itemName ?? ""}</p></td>
                    <td className="px-3 py-2.5">
                      {t ? (
                        <>
                          <Link href={editHref(t.id)} className="text-slate-800 hover:underline">{t.description ?? t.vendor ?? `#${t.id}`}</Link>
                          <p className="text-xs text-slate-500">{txBudgetPath(t)}</p>
                        </>
                      ) : "-"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      {t?.plannedAmount !== null && t?.plannedAmount !== undefined && t.plannedAmount !== t.amount ? (
                        <><span className="text-slate-400 line-through">{won(t.plannedAmount)}</span><span className="ml-1 font-medium text-red-600">{won(r.supplyAmount)}</span></>
                      ) : (
                        <span className="font-medium text-red-600">{won(r.supplyAmount)}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-slate-500">{won(r.vatAmount)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <form action={unmatchRecord}>
                        {hidden(r.id)}
                        <button type="submit" className="text-xs font-medium text-slate-500 hover:underline">연결 해제</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
