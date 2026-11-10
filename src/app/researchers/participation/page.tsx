// 참여율 계산 — 협약변경 때 인건비 편성(현금·현물)에 맞춰 연구원별 참여율을 정한다.
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { idOf } from "@/lib/ids";
import { allocationOf } from "@/lib/budget";
import { sameCategoryName } from "@/lib/budgetStandard";
import { toMonth, type FundType } from "@/lib/participation";
import ParticipationEditor from "@/components/ParticipationEditor";
import QuickProjectForm from "@/components/QuickProjectForm";
import { quickCreateProject, saveParticipation } from "./actions";

export const dynamic = "force-dynamic";

export default async function ParticipationPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year: yearParam } = await searchParams;
  const years = await prisma.projectYear.findMany({
    orderBy: [{ project: { active: "desc" } }, { project: { code: "desc" } }, { yearNo: "asc" }],
    include: { project: { select: { name: true, code: true } } },
  });
  const year = years.find((y) => y.id === idOf(yearParam)) ?? years[0];

  const researchers = await prisma.researcher.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, title: true } });

  if (!year) {
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold text-slate-900">참여율 계산</h1>
        <p className="mt-6 rounded-lg bg-slate-100 px-4 py-8 text-center text-sm text-slate-500">과제 연차가 없습니다.</p>
        <div className="mt-3"><QuickProjectForm action={quickCreateProject} /></div>
      </div>
    );
  }

  const [plans, txs] = await Promise.all([
    prisma.participation.findMany({ where: { projectYearId: year.id }, orderBy: { sortOrder: "asc" } }),
    prisma.transaction.findMany({
      where: { projectYearId: year.id, status: { not: "취소" } },
      select: { direction: true, amount: true, status: true, budgetAdjust: true, budgetItem: { select: { name: true } }, budgetSubItem: { select: { name: true } } },
    }),
  ]);
  // 예산표 기준 내부인건비(현금) 현재 편성 = 최초 편성 ± 편성 조정
  const ledgerCash = txs
    .filter((t) => sameCategoryName(t.budgetItem?.name ?? "", "인건비") && sameCategoryName(t.budgetSubItem?.name ?? "", "내부인건비(현금)"))
    .reduce((s, t) => s + allocationOf(t), 0);

  return (
    <div className="mx-auto min-w-0 w-full max-w-7xl">
      <Link href="/researchers" className="text-sm text-slate-400 hover:text-slate-700">← 연구원 관리</Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">참여율 계산</h1>
      <p className="mt-1 break-keep text-sm text-slate-500">
        인건비 편성(현금·현물)에 맞춰 연구원별 참여율을 정합니다. 월 인건비 = 기준연봉 × 참여율 ÷ 12 (원 미만 버림), 계상액 = 월 인건비 × 참여 개월수.
        자동 계산은 합계가 편성액을 넘지 않게 맞춥니다.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {years.map((y) => (
          <Link
            key={y.id}
            href={`/researchers/participation?year=${y.id}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${y.id === year.id ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"}`}
          >
            {y.project.code ?? y.project.name} · {y.label ?? `${y.yearNo}년차`}
          </Link>
        ))}
        <QuickProjectForm action={quickCreateProject} />
      </div>
      <p className="mt-2 break-keep text-sm font-medium text-slate-700">{year.project.name}</p>

      <ParticipationEditor
        key={year.id}
        projectYearId={year.id}
        projectName={year.project.name}
        defaultStart={toMonth(year.startDate)}
        defaultEnd={toMonth(year.endDate)}
        ledgerCash={ledgerCash}
        savedCashTarget={year.personnelCashTarget}
        savedInKindTarget={year.personnelInKindTarget}
        researchers={researchers}
        initialRows={plans.map((p) => ({
          key: p.id,
          researcherId: p.researcherId,
          fundType: (p.fundType === "IN_KIND" ? "IN_KIND" : "CASH") as FundType,
          role: p.role ?? "",
          startMonth: p.startMonth,
          endMonth: p.endMonth,
          baseSalary: p.baseSalary,
          rateBp: p.rateBp,
          locked: !!p.rateLocked,
          amountOverride: p.amountOverride,
        }))}
        save={saveParticipation}
      />
    </div>
  );
}
