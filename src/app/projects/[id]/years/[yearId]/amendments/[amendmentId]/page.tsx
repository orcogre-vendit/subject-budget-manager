// 협약변경 상세 — 초안이면 편집기, 반영됐으면 대비표·점검·반영 취소
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { idOf } from "@/lib/ids";
import { ymd } from "@/lib/format";
import { review, type AmendLine } from "@/lib/amendment";
import { loadLedgerState } from "@/lib/amendment-server";
import AmendmentEditor, { Findings } from "@/components/AmendmentEditor";
import AmendmentComparison from "@/components/AmendmentComparison";
import AmendmentAppliedActions from "@/components/AmendmentAppliedActions";
import { applyAmendment, deleteAmendment, reloadBefore, saveAmendment, unapplyAmendment } from "../actions";

export const dynamic = "force-dynamic";

export default async function AmendmentPage({ params }: { params: Promise<{ id: string; yearId: string; amendmentId: string }> }) {
  const p = await params;
  const projectId = idOf(p.id);
  const projectYearId = idOf(p.yearId);
  const amendmentId = idOf(p.amendmentId);
  if (!projectId || !projectYearId || !amendmentId) notFound();
  const a = await prisma.budgetAmendment.findUnique({
    where: { id: amendmentId },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      projectYear: { include: { project: { select: { name: true, code: true } } } },
      transactions: { select: { seqNo: true, direction: true, amount: true, description: true }, orderBy: { seqNo: "asc" } },
    },
  });
  if (!a || a.projectYearId !== projectYearId || a.projectYear.projectId !== projectId) notFound();
  const state = await loadLedgerState(projectYearId);
  const lines: AmendLine[] = a.lines.map((l) => ({
    key: l.id,
    itemName: l.itemName,
    subName: l.subName,
    detailName: l.detailName,
    fundType: l.fundType === "IN_KIND" ? "IN_KIND" : "CASH",
    inLedger: !!l.inLedger,
    beforeAmt: l.beforeAmt,
    afterAmt: l.afterAmt,
    note: l.note,
  }));
  const y = a.projectYear;
  const subject = `과제번호 : ${y.project.code ?? "-"} · ${y.label ?? `${y.yearNo}년차`} · ${y.project.name}`;
  const base = `/projects/${projectId}/years/${projectYearId}`;

  return (
    <div className="mx-auto min-w-0 w-full max-w-7xl">
      <Link href={`${base}/amendments`} className="text-sm text-slate-400 hover:text-slate-700 print:hidden">← 협약변경 목록</Link>
      <div className="mt-2 flex flex-wrap items-center gap-2 print:hidden">
        <h1 className="text-2xl font-bold text-slate-900">{a.title}</h1>
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${a.status === "APPLIED" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
          {a.status === "APPLIED" ? `반영됨 ${a.appliedAt ? ymd(a.appliedAt) : ""}` : "초안"}
        </span>
      </div>
      <p className="mt-1 break-keep text-sm text-slate-500 print:hidden">{subject}</p>

      <div className="mt-5">
        {a.status === "DRAFT" ? (
          <AmendmentEditor
            amendmentId={a.id}
            initial={{ title: a.title, effectiveDate: ymd(a.effectiveDate), reason: a.reason ?? "", lines }}
            spentBySub={[...state.spentBySub]}
            spentByItem={[...state.spentByItem]}
            subjectLabel={subject}
            save={saveAmendment}
            apply={applyAmendment}
            reload={reloadBefore}
            remove={deleteAmendment}
          />
        ) : (
          <div className="space-y-5">
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 print:hidden">
              <p>기준일 {ymd(a.effectiveDate)}{a.reason ? ` · ${a.reason}` : ""}</p>
              <p className="mt-1 text-xs text-slate-500">장부에 추가된 조정 레코드 {a.transactions.length}건 — 원 편성은 그대로입니다.</p>
              <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                {a.transactions.map((t, i) => (
                  <li key={i}>No. {String(t.seqNo ?? "").padStart(2, "0")} · <span className={t.direction === "IN" ? "text-blue-700" : "text-red-600"}>{t.direction === "IN" ? "+" : "−"}{t.amount.toLocaleString("ko-KR")}</span> · {t.description}</li>
                ))}
              </ul>
            </div>
            <div className="print:hidden"><Findings findings={review(lines, state.spentBySub, state.spentByItem)} /></div>
            <AmendmentComparison lines={lines} subtitle={subject} />
            <AmendmentAppliedActions amendmentId={a.id} lines={lines} unapply={unapplyAmendment} />
          </div>
        )}
      </div>
    </div>
  );
}
