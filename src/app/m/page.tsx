// 모바일 첫 화면 — 진행 중인 과제·연차 카드. 누르면 그 연차 원장으로.
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { won } from "@/lib/format";
import { allocationOf, spendingOf } from "@/lib/budget";

export const dynamic = "force-dynamic";

export default async function MobileHome() {
  const [years, sums] = await Promise.all([
    prisma.projectYear.findMany({
      where: { project: { active: true } },
      orderBy: [{ project: { code: "desc" } }, { yearNo: "desc" }],
      include: { project: { select: { name: true, code: true } } },
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
    <div>
      <h1 className="text-xl font-bold text-slate-900">집행 원장</h1>
      <p className="mt-1 text-sm text-slate-500">과제를 고르면 거래 목록이 열립니다. 거래를 누르면 사진을 올릴 수 있습니다.</p>
      <div className="mt-4 space-y-3">
        {years.length === 0 && <p className="rounded-xl bg-slate-100 p-6 text-center text-sm text-slate-500">진행 중인 과제가 없습니다.</p>}
        {years.map((y) => {
          const e = stat.get(y.id) ?? { alloc: 0, spent: 0 };
          return (
            <Link key={y.id} href={`/m/years/${y.id}`} className="block rounded-2xl border border-slate-200 bg-white p-4 active:bg-slate-50">
              <p className="text-xs text-slate-400">{y.project.code ?? "-"} · {y.yearNo}년차</p>
              <p className="mt-1 break-keep text-base font-semibold leading-6 text-slate-900">{y.project.name}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-slate-50 py-2">
                  <p className="text-[11px] text-slate-500">편성</p>
                  <p className="text-sm font-bold text-blue-700">{won(e.alloc)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 py-2">
                  <p className="text-[11px] text-slate-500">집행</p>
                  <p className="text-sm font-bold text-red-600">{won(e.spent)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 py-2">
                  <p className="text-[11px] text-slate-500">잔액</p>
                  <p className="text-sm font-bold text-slate-900">{won(e.alloc - e.spent)}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
