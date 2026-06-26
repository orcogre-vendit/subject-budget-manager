import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { won, ymd } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await prisma.project.findMany({
    orderBy: [{ active: "desc" }, { code: "desc" }, { id: "desc" }],
    include: { years: { select: { budgetCash: true } } },
  });

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">과제 관리</h1>
          <p className="mt-1 text-sm text-slate-500">총 {projects.length}건</p>
        </div>
        <Link
          href="/projects/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          + 새 과제
        </Link>
      </div>

      {projects.length === 0 ? (
        <p className="mt-6 rounded-lg bg-slate-100 px-4 py-8 text-center text-sm text-slate-500">
          등록된 과제가 없습니다. 우측 상단에서 추가하세요.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-3 font-medium">과제번호</th>
                <th className="px-4 py-3 font-medium">과제명</th>
                <th className="px-4 py-3 font-medium">연구책임</th>
                <th className="px-4 py-3 font-medium">진행상태</th>
                <th className="px-4 py-3 font-medium">연구기간</th>
                <th className="px-4 py-3 text-center font-medium">연차</th>
                <th className="px-4 py-3 text-right font-medium">총 편성예산</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const total = p.years.reduce((s, y) => s + y.budgetCash, 0);
                return (
                  <tr
                    key={p.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {p.code ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/projects/${p.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {p.name}
                      </Link>
                      {!p.active && (
                        <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500">
                          미사용
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {p.piName ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {p.status ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {p.startDate || p.endDate
                        ? `${ymd(p.startDate)} ~ ${ymd(p.endDate)}`
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">
                      {p.years.length}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">
                      {won(total)}
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
