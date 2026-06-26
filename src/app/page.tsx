import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { won, ymd, executionRate } from "@/lib/format";

export const dynamic = "force-dynamic";

// 비목 분포 바 색상 팔레트
const PALETTE = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-slate-500",
];

function rateColor(rate: number): string {
  if (rate > 100) return "bg-red-500";
  if (rate >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

export default async function DashboardPage() {
  const [
    projectCount,
    researcherCount,
    txCount,
    budgetSum,
    dirAgg,
    projects,
    txByYear,
    itemAgg,
    items,
    recent,
  ] = await Promise.all([
    prisma.project.count({ where: { active: true } }),
    prisma.researcher.count(),
    prisma.transaction.count(),
    prisma.projectYear.aggregate({ _sum: { budgetCash: true } }),
    prisma.transaction.groupBy({ by: ["direction"], _sum: { amount: true } }),
    prisma.project.findMany({
      where: { active: true },
      orderBy: [{ code: "desc" }, { id: "desc" }],
      include: { years: { select: { id: true, budgetCash: true } } },
    }),
    prisma.transaction.groupBy({
      by: ["projectYearId", "direction"],
      _sum: { amount: true },
    }),
    prisma.transaction.groupBy({
      by: ["budgetItemId", "direction"],
      _sum: { amount: true },
    }),
    prisma.budgetItem.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.transaction.findMany({
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: 6,
      include: {
        projectYear: {
          select: { yearNo: true, project: { select: { id: true, name: true } } },
        },
        budgetItem: { select: { name: true } },
      },
    }),
  ]);

  const totalBudget = budgetSum._sum.budgetCash ?? 0;
  const totalIn = dirAgg.find((a) => a.direction === "IN")?._sum.amount ?? 0;
  const totalOut = dirAgg.find((a) => a.direction === "OUT")?._sum.amount ?? 0;
  const balance = totalIn - totalOut;
  const totalRate = executionRate(totalOut, totalBudget);

  // 연차별 입출 합계
  const yearMap = new Map<number, { in: number; out: number }>();
  for (const r of txByYear) {
    const e = yearMap.get(r.projectYearId) ?? { in: 0, out: 0 };
    if (r.direction === "IN") e.in += r._sum.amount ?? 0;
    else e.out += r._sum.amount ?? 0;
    yearMap.set(r.projectYearId, e);
  }

  // 과제별 집행 현황
  const projStats = projects
    .map((p) => {
      let budget = 0;
      let out = 0;
      for (const y of p.years) {
        budget += y.budgetCash;
        const e = yearMap.get(y.id);
        if (e) out += e.out;
      }
      return {
        id: p.id,
        name: p.name,
        code: p.code,
        budget,
        out,
        rate: executionRate(out, budget),
      };
    })
    .filter((p) => p.budget > 0 || p.out > 0)
    .sort((a, b) => b.out - a.out)
    .slice(0, 8);

  // 비목별 출금 분포
  const itemOut = new Map<number, number>();
  for (const r of itemAgg) {
    if (r.direction !== "OUT" || r.budgetItemId == null) continue;
    itemOut.set(
      r.budgetItemId,
      (itemOut.get(r.budgetItemId) ?? 0) + (r._sum.amount ?? 0),
    );
  }
  const itemStats = items
    .map((it) => ({ name: it.name, out: itemOut.get(it.id) ?? 0 }))
    .filter((it) => it.out > 0)
    .sort((a, b) => b.out - a.out);
  const itemOutTotal = itemStats.reduce((s, it) => s + it.out, 0);

  const cards = [
    { label: "진행 과제", value: `${projectCount}건`, href: "/projects" },
    { label: "연구원", value: `${researcherCount}명`, href: "/researchers" },
    { label: "총 편성예산", value: won(totalBudget) },
    {
      label: "총 집행액",
      value: won(totalOut),
      sub: `집행률 ${totalRate}%`,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold text-slate-900">대시보드</h1>
      <p className="mt-1 text-sm text-slate-500">연구실 과제 예산집행 현황 요약</p>

      {/* 요약 카드 */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-slate-200 bg-white p-5"
          >
            <p className="text-sm text-slate-500">{c.label}</p>
            <p className="mt-2 text-xl font-bold text-slate-900">{c.value}</p>
            {c.sub ? (
              <p className="mt-1 text-xs text-slate-400">{c.sub}</p>
            ) : c.href ? (
              <Link
                href={c.href}
                className="mt-1 inline-block text-xs text-slate-400 hover:text-slate-700"
              >
                바로가기 →
              </Link>
            ) : (
              <p className="mt-1 text-xs">&nbsp;</p>
            )}
          </div>
        ))}
      </div>

      {/* 입금/출금/잔액 */}
      <div className="mt-4 grid grid-cols-3 gap-4 rounded-xl border border-slate-200 bg-white p-5 text-center">
        <div>
          <p className="text-xs text-slate-500">총 입금</p>
          <p className="mt-1 text-lg font-semibold text-blue-600">
            {won(totalIn)}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">총 출금</p>
          <p className="mt-1 text-lg font-semibold text-red-600">
            {won(totalOut)}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">잔액</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {won(balance)}
          </p>
        </div>
      </div>

      {txCount === 0 ? (
        <p className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          아직 집행 내역이 없습니다. 과제를 등록하고 집행 원장을 입력해 보세요.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* 과제별 집행 현황 */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-slate-900">
              과제별 집행 현황
            </h2>
            {projStats.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">
                편성예산 또는 집행이 있는 진행 과제가 없습니다.
              </p>
            ) : (
              <ul className="mt-4 space-y-4">
                {projStats.map((p) => (
                  <li key={p.id}>
                    <div className="flex items-baseline justify-between gap-2">
                      <Link
                        href={`/projects/${p.id}`}
                        className="truncate text-sm font-medium text-slate-800 hover:underline"
                      >
                        {p.name}
                      </Link>
                      <span className="shrink-0 text-xs text-slate-400">
                        {p.rate}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${rateColor(p.rate)}`}
                        style={{ width: `${Math.min(p.rate, 100)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {won(p.out)} / {won(p.budget)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 비목별 집행 분포 */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-slate-900">
              비목별 집행 분포
            </h2>
            {itemStats.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">출금 집행이 없습니다.</p>
            ) : (
              <ul className="mt-4 space-y-4">
                {itemStats.map((it, i) => {
                  const pct =
                    itemOutTotal > 0
                      ? Math.round((it.out / itemOutTotal) * 1000) / 10
                      : 0;
                  return (
                    <li key={it.name}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium text-slate-800">
                          {it.name}
                        </span>
                        <span className="shrink-0 text-xs text-slate-400">
                          {pct}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${PALETTE[i % PALETTE.length]}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{won(it.out)}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* 최근 거래 */}
      {recent.length > 0 && (
        <section className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-900">최근 거래</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-6 py-2.5 font-medium">날짜</th>
                <th className="px-6 py-2.5 font-medium">과제</th>
                <th className="px-6 py-2.5 font-medium">비목</th>
                <th className="px-6 py-2.5 font-medium">적요</th>
                <th className="px-6 py-2.5 text-right font-medium">금액</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((t) => {
                const isIn = t.direction === "IN";
                return (
                  <tr
                    key={t.id}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="whitespace-nowrap px-6 py-2.5 text-slate-600">
                      {ymd(t.date)}
                    </td>
                    <td className="px-6 py-2.5">
                      <Link
                        href={`/projects/${t.projectYear.project.id}`}
                        className="text-slate-700 hover:underline"
                      >
                        {t.projectYear.project.name}
                        <span className="ml-1 text-xs text-slate-400">
                          {t.projectYear.yearNo}년차
                        </span>
                      </Link>
                    </td>
                    <td className="px-6 py-2.5 text-xs text-slate-500">
                      {t.budgetItem?.name ?? "-"}
                    </td>
                    <td className="px-6 py-2.5 text-slate-700">
                      {t.description ?? "-"}
                    </td>
                    <td
                      className={`whitespace-nowrap px-6 py-2.5 text-right font-medium ${
                        isIn ? "text-blue-600" : "text-red-600"
                      }`}
                    >
                      {isIn ? "+" : "−"}
                      {won(t.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
