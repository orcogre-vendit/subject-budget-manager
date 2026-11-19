// 협약변경 목록 — 연차별 이력과 새 협약변경 만들기
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { idOf } from "@/lib/ids";
import { ymd } from "@/lib/format";
import { review, totals, type AmendLine } from "@/lib/amendment";
import { loadLedgerState } from "@/lib/amendment-server";
import { createAmendment } from "./actions";

export const dynamic = "force-dynamic";

export default async function AmendmentsPage({ params }: { params: Promise<{ id: string; yearId: string }> }) {
  const { id, yearId } = await params;
  const projectId = idOf(id);
  const projectYearId = idOf(yearId);
  if (!projectId || !projectYearId) notFound();
  const year = await prisma.projectYear.findUnique({ where: { id: projectYearId }, include: { project: { select: { name: true, code: true } } } });
  if (!year || year.projectId !== projectId) notFound();
  const [list, state] = await Promise.all([
    prisma.budgetAmendment.findMany({
      where: { projectYearId },
      orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
      include: { lines: true, _count: { select: { transactions: true } } },
    }),
    loadLedgerState(projectYearId),
  ]);
  const base = `/projects/${projectId}/years/${projectYearId}`;

  return (
    <div className="mx-auto min-w-0 w-full max-w-5xl">
      <Link href={`${base}/budget`} className="text-sm text-slate-400 hover:text-slate-700">← 예산표</Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">협약변경</h1>
          <p className="mt-1 break-keep text-sm text-slate-500">{year.project.code ?? ""} · {year.label ?? `${year.yearNo}년차`} · {year.project.name}</p>
        </div>
        <form action={createAmendment}>
          <input type="hidden" name="projectYearId" value={projectYearId} />
          <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">+ 새 협약변경</button>
        </form>
      </div>
      <p className="mt-3 break-keep text-sm text-slate-500">
        지금 장부 편성을 ‘변경 전’으로 채운 초안을 만들고, ‘변경 후’를 넣어 점검·대비표를 확인한 뒤 장부에 반영합니다. 반영은 원 편성을 고치지 않고 조정 레코드를 추가하며, 반영 취소하면 그 레코드만 지워집니다.
      </p>

      <ul className="mt-5 space-y-3">
        {list.length === 0 && <li className="rounded-xl bg-slate-100 p-8 text-center text-sm text-slate-500">아직 협약변경이 없습니다.</li>}
        {list.map((a) => {
          const lines: AmendLine[] = a.lines.map((l) => ({ key: l.id, itemName: l.itemName, subName: l.subName, detailName: l.detailName, fundType: l.fundType === "IN_KIND" ? "IN_KIND" : "CASH", inLedger: !!l.inLedger, beforeAmt: l.beforeAmt, afterAmt: l.afterAmt, note: l.note }));
          const t = totals(lines);
          const changed = lines.filter((l) => l.afterAmt !== l.beforeAmt).length;
          const f = review(lines, state.spentBySub, state.spentByItem);
          const approval = f.some((x) => x.level === "approval");
          return (
            <li key={a.id}>
              <Link href={`${base}/amendments/${a.id}`} className="block rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${a.status === "APPLIED" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                    {a.status === "APPLIED" ? "반영됨" : "초안"}
                  </span>
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${approval ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200" : "bg-green-50 text-green-800 ring-1 ring-green-200"}`}>
                    {approval ? "📮 사전승인 대상" : "통보 사항"}
                  </span>
                  <span className="text-base font-semibold text-slate-900">{a.title}</span>
                  <span className="text-xs text-slate-400">기준일 {ymd(a.effectiveDate)}</span>
                </div>
                <p className="mt-1.5 text-sm text-slate-600">
                  바뀐 줄 {changed}개 · 총액 {t.before.toLocaleString("ko-KR")} → {t.after.toLocaleString("ko-KR")}원
                  {a.status === "APPLIED" && ` · 조정 레코드 ${a._count.transactions}건`}
                </p>
                {a.reason && <p className="mt-1 break-keep text-xs text-slate-500">{a.reason}</p>}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
