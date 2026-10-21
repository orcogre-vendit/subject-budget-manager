// 모바일 원장 — 거래 카드 목록(최근 순). 필터: 전체 / 증빙 부족·신청 중 / 부가세 입금 필요.
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { idOf } from "@/lib/ids";
import { won, ymd } from "@/lib/format";
import { allocationOf, spendingOf } from "@/lib/budget";
import { seqLabel } from "@/lib/evidenceName";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "all", label: "전체" },
  { key: "pending", label: "신청 중" },
  { key: "vat", label: "부가세 입금 필요" },
] as const;

export default async function MobileLedger({
  params,
  searchParams,
}: {
  params: Promise<{ yearId: string }>;
  searchParams: Promise<{ f?: string }>;
}) {
  const { yearId } = await params;
  const { f = "all" } = await searchParams;
  const projectYearId = idOf(yearId);
  if (!projectYearId) notFound();

  const [year, txs] = await Promise.all([
    prisma.projectYear.findUnique({ where: { id: projectYearId }, include: { project: { select: { name: true, code: true } } } }),
    prisma.transaction.findMany({
      where: { projectYearId },
      orderBy: [{ date: "desc" }, { seqNo: "desc" }],
      include: {
        budgetItem: { select: { name: true } },
        budgetSubItem: { select: { name: true } },
        _count: { select: { attachments: true } },
        rcmsRecord: { select: { progress: true, missingSince: true } },
      },
    }),
  ]);
  if (!year) notFound();

  const live = txs.filter((t) => t.status !== "취소");
  const alloc = live.reduce((s, t) => s + allocationOf(t), 0);
  const spent = live.reduce((s, t) => s + spendingOf(t), 0);
  const vatPending = (t: (typeof txs)[number]) =>
    t.direction === "OUT" && !t.budgetAdjust && t.vatAmount > 0 && t.status !== "완료" && t.status !== "취소";
  const list = txs.filter((t) =>
    f === "pending" ? t.direction === "OUT" && !t.budgetAdjust && t.status === "신청" : f === "vat" ? vatPending(t) : true,
  );

  return (
    <div>
      <Link href="/m" className="text-sm text-slate-400">← 과제 목록</Link>
      <h1 className="mt-1 break-keep text-lg font-bold leading-6 text-slate-900">{year.project.name}</h1>
      <p className="text-xs text-slate-400">{year.project.code ?? "-"} · {year.yearNo}년차</p>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-slate-200 bg-white py-2.5">
          <p className="text-[11px] text-slate-500">편성</p>
          <p className="text-sm font-bold text-blue-700">{won(alloc)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white py-2.5">
          <p className="text-[11px] text-slate-500">집행</p>
          <p className="text-sm font-bold text-red-600">{won(spent)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white py-2.5">
          <p className="text-[11px] text-slate-500">잔액</p>
          <p className="text-sm font-bold text-slate-900">{won(alloc - spent)}</p>
        </div>
      </div>

      <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1">
        {FILTERS.map((x) => (
          <Link
            key={x.key}
            href={x.key === "all" ? `/m/years/${projectYearId}` : `/m/years/${projectYearId}?f=${x.key}`}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${f === x.key ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-600"}`}
          >
            {x.label}
          </Link>
        ))}
      </div>

      <ul className="mt-3 space-y-2.5">
        {list.length === 0 && <li className="rounded-xl bg-slate-100 p-6 text-center text-sm text-slate-500">해당하는 거래가 없습니다.</li>}
        {list.map((t) => {
          const isIn = t.direction === "IN";
          const cancelled = t.status === "취소";
          return (
            <li key={t.id}>
              <Link
                href={`/m/tx/${t.id}`}
                className={`block rounded-2xl border p-4 active:bg-slate-50 ${vatPending(t) ? "border-orange-200 bg-orange-50/50" : "border-slate-200 bg-white"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400">
                      No. {seqLabel(t.seqNo)} · {ymd(t.date)}
                    </p>
                    <p className="mt-1 break-keep text-[15px] font-semibold leading-5 text-slate-900">{t.description ?? t.vendor ?? "적요 없음"}</p>
                    <p className="mt-1 break-keep text-xs text-slate-500">{[t.budgetItem?.name, t.budgetSubItem?.name].filter(Boolean).join(" › ") || "미분류"}</p>
                  </div>
                  <p
                    className={`shrink-0 text-right text-base font-bold ${
                      cancelled ? "text-slate-400 line-through" : t.budgetAdjust ? "text-violet-600" : isIn ? "text-blue-600" : "text-red-600"
                    }`}
                  >
                    {isIn ? "+" : "−"}
                    {won(t.amount)}
                  </p>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className={`rounded px-1.5 py-0.5 font-semibold ${t.status === "완료" ? "bg-green-100 text-green-700" : cancelled ? "bg-slate-200 text-slate-500" : "bg-amber-100 text-amber-700"}`}>
                    {t.status}
                  </span>
                  {t.budgetAdjust && <span className="rounded bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-700">편성 조정</span>}
                  {t.rcmsRecord && (
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 font-semibold text-blue-700">
                      RCMS {t.rcmsRecord.missingSince ? "이체완료" : t.rcmsRecord.progress ?? "등록"}
                    </span>
                  )}
                  {vatPending(t) && <span className="rounded bg-orange-100 px-1.5 py-0.5 font-semibold text-orange-700">💰 부가세 {won(t.vatAmount)} 입금 필요</span>}
                  {!isIn && !t.budgetAdjust && (
                    <span className={`ml-auto font-medium ${t._count.attachments ? "text-slate-500" : "text-red-500"}`}>
                      📎 {t._count.attachments ? `증빙 ${t._count.attachments}` : "증빙 없음"}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
