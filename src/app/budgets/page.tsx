// 예산표 목록 — 사이드바 "예산표" 메뉴. 과제·연차마다 현재 편성/집행/잔액을 보여 주고 연차별 예산표로 들어간다.
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { won, executionRate } from "@/lib/format";
import { allocationOf, spendingOf } from "@/lib/budget";

export const dynamic = "force-dynamic";

export default async function BudgetsPage() {
  const [years, sums] = await Promise.all([
    prisma.projectYear.findMany({
      orderBy: [{ project: { active: "desc" } }, { project: { code: "desc" } }, { yearNo: "asc" }],
      include: { project: { select: { id: true, name: true, code: true, active: true } } },
    }),
    prisma.transaction.groupBy({
      by: ["projectYearId", "direction", "budgetAdjust"],
      where: { status: { not: "취소" } },
      _sum: { amount: true },
    }),
  ]);

  const stat = new Map<string, { alloc: number; spent: number }>();
  for (const r of sums) {
    const e = stat.get(r.projectYearId) ?? { alloc: 0, spent: 0 };
    const flow = { direction: r.direction, budgetAdjust: r.budgetAdjust, amount: r._sum.amount ?? 0 };
    e.alloc += allocationOf(flow);
    e.spent += spendingOf(flow);
    stat.set(r.projectYearId, e);
  }

  return (
    <div className="mx-auto min-w-0 w-full max-w-6xl">
      <h1 className="text-2xl font-bold text-slate-900">예산표</h1>
      <p className="mt-1 text-sm text-slate-500">
        과제·연차별 현재 편성(최초 편성 ± 협약변경 조정)과 집행·잔액입니다. 행을 누르면 비목·세목별 예산표가 열립니다.
      </p>

      {years.length === 0 ? (
        <p className="mt-6 rounded-lg bg-slate-100 px-4 py-8 text-center text-sm text-slate-500">등록된 연차가 없습니다.</p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[880px] text-sm [&_th]:whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-3 font-medium">과제</th>
                <th className="px-4 py-3 font-medium">연차</th>
                <th className="px-4 py-3 text-right font-medium">현재 편성</th>
                <th className="px-4 py-3 text-right font-medium">집행</th>
                <th className="px-4 py-3 text-right font-medium">잔액</th>
                <th className="px-4 py-3 text-right font-medium">집행률</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {years.map((y) => {
                const e = stat.get(y.id) ?? { alloc: 0, spent: 0 };
                const href = `/projects/${y.project.id}/years/${y.id}/budget`;
                return (
                  <tr key={y.id} className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${y.project.active ? "" : "opacity-60"}`}>
                    <td className="min-w-[280px] px-4 py-3">
                      <Link href={href} className="break-keep font-medium text-slate-800 hover:underline">{y.project.name}</Link>
                      <p className="text-xs text-slate-400">{y.project.code ?? "-"}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {y.yearNo}년차{y.label ? <span className="ml-1 text-xs text-slate-400">{y.label}</span> : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-blue-700">{won(e.alloc)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-red-600">{won(e.spent)}</td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${e.alloc - e.spent < 0 ? "text-red-700" : "text-slate-900"}`}>{won(e.alloc - e.spent)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-slate-500">{e.alloc > 0 ? `${executionRate(e.spent, e.alloc)}%` : "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Link href={href} className="whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500">
                        📊 예산표
                      </Link>
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
