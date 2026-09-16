import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { won, ymd } from "@/lib/format";
import { yearInclude } from "@/lib/rcms/db";
import { buildItemRows, buildWarnings } from "@/lib/rcms/match";
import RcmsImportForm from "@/components/RcmsImportForm";
import { importRcms } from "./actions";

export const dynamic = "force-dynamic";

const dt = (d: Date) => `${ymd(d)} ${d.toISOString().slice(11, 16)}`;

export default async function RcmsPage() {
  const [years, imports] = await Promise.all([
    prisma.projectYear.findMany({
      where: { ledgerType: "PROJECT" },
      orderBy: [{ projectId: "asc" }, { yearNo: "asc" }],
      include: yearInclude,
    }),
    prisma.rcmsImport.findMany({ orderBy: { importedAt: "desc" }, take: 10 }),
  ]);

  const rows = years
    .filter((y) => y.rcmsRecords.length || y.transactions.length)
    .map((y) => {
      const items = buildItemRows(y.transactions, y.rcmsRecords);
      const warnings = buildWarnings(y.transactions, y.rcmsRecords, items);
      const rcms = y.rcmsRecords.reduce((s, r) => s + r.supplyAmount, 0);
      const pending = items.reduce((s, i) => s + i.pending, 0);
      const matched = y.rcmsRecords.filter((r) => r.transactionId).length;
      return {
        y,
        rcms,
        pending,
        available: y.budgetCash - rcms - pending,
        matched,
        unmatched: y.rcmsRecords.length - matched,
        danger: warnings.filter((w) => w.level === "danger").length,
        warn: warnings.filter((w) => w.level === "warn").length,
      };
    });

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold text-slate-900">RCMS 대조</h1>
      <p className="mt-1 text-sm text-slate-500">
        RCMS 는 실행된 집행의 원본, 이 장부는 품의·약정의 원본입니다. RCMS 엑셀을 가져오면 사용등록 건이 품의와 자동 매칭되고 실집행액이 장부에 반영됩니다.
      </p>

      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-900">RCMS 엑셀 가져오기</h2>
        <p className="mt-1 text-xs text-slate-500">
          RCMS → 연구비사용 → <b>연구비 이체 실행 대상 목록</b> 화면의 엑셀 다운로드 파일(.xlsx)을 올리세요. 과제번호는 과제 코드의 숫자 부분과, 연차는 연차 번호와 맞춥니다.
          같은 건을 다시 올리면 갱신되고, 목록에서 빠진 건은 이체 실행 완료로 표시됩니다.
        </p>
        <RcmsImportForm action={importRcms} />
      </div>

      <h2 className="mt-8 text-lg font-bold text-slate-900">과제·연차별 대조 현황</h2>
      {rows.length === 0 ? (
        <p className="mt-3 rounded-lg bg-slate-100 px-4 py-6 text-center text-sm text-slate-500">아직 대조할 데이터가 없습니다.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-2.5 font-medium">과제</th>
                <th className="px-4 py-2.5 font-medium">연차</th>
                <th className="px-4 py-2.5 text-right font-medium">편성예산</th>
                <th className="px-4 py-2.5 text-right font-medium">RCMS 등록</th>
                <th className="px-4 py-2.5 text-right font-medium">미등록 품의</th>
                <th className="px-4 py-2.5 text-right font-medium">가용잔액</th>
                <th className="px-4 py-2.5 text-center font-medium">매칭</th>
                <th className="px-4 py-2.5 text-center font-medium">경고</th>
                <th className="px-4 py-2.5 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.y.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-slate-800">{r.y.project.name}</p>
                    <p className="text-xs text-slate-400">{r.y.project.code ?? "-"}</p>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{r.y.yearNo}년차</td>
                  <td className="px-4 py-2.5 text-right text-slate-800">{won(r.y.budgetCash)}</td>
                  <td className="px-4 py-2.5 text-right text-red-600">{won(r.rcms)}</td>
                  <td className="px-4 py-2.5 text-right text-amber-700">{won(r.pending)}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${r.available < 0 ? "text-red-700" : "text-slate-900"}`}>{won(r.available)}</td>
                  <td className="px-4 py-2.5 text-center text-xs text-slate-600">
                    {r.matched}/{r.y.rcmsRecords.length}
                    {r.unmatched > 0 && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">미매칭 {r.unmatched}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center text-xs">
                    {r.danger > 0 && <span className="mr-1 rounded bg-red-100 px-1.5 py-0.5 font-semibold text-red-700">🔴 {r.danger}</span>}
                    {r.warn > 0 && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-700">⚠️ {r.warn}</span>}
                    {r.danger + r.warn === 0 && <span className="text-slate-400">-</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link href={`/rcms/${r.y.id}`} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">대조표</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {imports.length > 0 && (
        <>
          <h2 className="mt-8 text-lg font-bold text-slate-900">가져오기 이력</h2>
          <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {imports.map((im) => {
              const skipped: [string, number][] = im.skipped ? JSON.parse(im.skipped) : [];
              return (
                <li key={im.id} className="px-4 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-xs text-slate-400">{dt(im.importedAt)}</span>
                    <span className="font-medium text-slate-800">{im.fileName}</span>
                    <span className="text-xs text-slate-500">
                      {im.rowCount}행 · 신규 {im.newCount} · 갱신 {im.updatedCount} · 매칭 {im.matchedCount} · 사라짐 {im.missingCount}
                    </span>
                  </div>
                  {skipped.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-xs text-amber-700">
                      {skipped.map(([reason, n]) => <li key={reason}>{reason} ({n}건)</li>)}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
