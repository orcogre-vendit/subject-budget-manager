// 예산표 — 비목·세목별 최초 편성 / 편성 조정(협약변경 등) / 현재 편성 / 집행 / 잔액. 거래 입력 없이 숫자만 본다.
// 최초 편성 = 일반 입금, 조정 = 편성 조정 레코드(+입금 증액, −출금 감액), 집행 = 조정이 아닌 출금(취소 제외)
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { idOf } from "@/lib/ids";
import { won, ymd, executionRate } from "@/lib/format";
import { spendingOf } from "@/lib/budget";

export const dynamic = "force-dynamic";

type Cell = { initial: number; adjust: number; spent: number; pending: number };
const empty = (): Cell => ({ initial: 0, adjust: 0, spent: 0, pending: 0 });
const add = (a: Cell, b: Cell) => {
  a.initial += b.initial;
  a.adjust += b.adjust;
  a.spent += b.spent;
  a.pending += b.pending;
};
const current = (c: Cell) => c.initial + c.adjust;

const signed = (n: number) => (n === 0 ? "-" : `${n > 0 ? "+" : "−"}${Math.abs(n).toLocaleString("ko-KR")}`);

const num = "px-3 py-2 text-right tabular-nums whitespace-nowrap";

function Line({ label, c, strong, indent }: { label: string; c: Cell; strong?: boolean; indent?: boolean }) {
  const cur = current(c);
  const left = cur - c.spent;
  return (
    <tr className={`border-b border-slate-100 ${strong ? "bg-slate-50 font-semibold" : ""}`}>
      <td className={`px-3 py-2 text-slate-800 ${indent ? "pl-8 text-xs text-slate-600" : ""}`}>{label}</td>
      <td className={`${num} text-slate-500`}>{c.initial ? c.initial.toLocaleString("ko-KR") : "-"}</td>
      <td className={`${num} ${c.adjust !== 0 ? "text-violet-700" : "text-slate-300"}`}>{signed(c.adjust)}</td>
      <td className={`${num} text-blue-700`}>{cur.toLocaleString("ko-KR")}</td>
      <td className={`${num} text-red-600`}>
        {c.spent ? c.spent.toLocaleString("ko-KR") : "-"}
        {c.pending > 0 && <span className="block text-[10px] font-normal text-amber-700">신청 중 {c.pending.toLocaleString("ko-KR")}</span>}
      </td>
      <td className={`${num} ${left < 0 ? "text-red-700" : "text-slate-900"}`}>{left.toLocaleString("ko-KR")}</td>
      <td className={`${num} text-slate-500`}>{cur > 0 ? `${executionRate(c.spent, cur)}%` : "-"}</td>
    </tr>
  );
}

export default async function BudgetTablePage({
  params,
}: {
  params: Promise<{ id: string; yearId: string }>;
}) {
  const { id, yearId } = await params;
  const projectId = idOf(id);
  const projectYearId = idOf(yearId);
  if (!projectId || !projectYearId) notFound();

  const [year, txs, items] = await Promise.all([
    prisma.projectYear.findUnique({
      where: { id: projectYearId },
      include: { project: { select: { id: true, name: true, code: true } } },
    }),
    prisma.transaction.findMany({
      where: { projectYearId, status: { not: "취소" } },
      orderBy: [{ date: "asc" }, { seqNo: "asc" }],
      select: {
        id: true,
        date: true,
        status: true,
        direction: true,
        amount: true,
        description: true,
        budgetAdjust: true,
        budgetItemId: true,
        budgetItem: { select: { name: true } },
        budgetSubItem: { select: { name: true } },
        budgetDetailItem: { select: { name: true } },
      },
    }),
    prisma.budgetItem.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!year || year.projectId !== projectId) notFound();

  // 비목 → 세목 → 금액 (세목 없이 비목 단위로 편성된 금액은 "(비목 공통)")
  const NO_SUB = "(비목 공통)";
  const tree = new Map<string, { cell: Cell; subs: Map<string, Cell> }>();
  const node = (item: string, sub: string) => {
    let it = tree.get(item);
    if (!it) { it = { cell: empty(), subs: new Map() }; tree.set(item, it); }
    let sc = it.subs.get(sub);
    if (!sc) { sc = empty(); it.subs.set(sub, sc); }
    return { it, sc };
  };
  for (const t of txs) {
    const item = t.budgetItem?.name ?? "(미분류)";
    const sub = t.budgetSubItem?.name ?? NO_SUB;
    const c = empty();
    if (t.budgetAdjust) c.adjust = t.direction === "IN" ? t.amount : -t.amount;
    else if (t.direction === "IN") c.initial = t.amount;
    else {
      c.spent = spendingOf(t);
      if (t.status !== "완료") c.pending = t.amount; // 신청 중(아직 완료 안 됨) — 집행에 포함되어 있음
    }
    const { it, sc } = node(item, sub);
    add(sc, c);
    add(it.cell, c);
  }
  const order = new Map(items.map((i, idx) => [i.name, idx]));
  const rows = [...tree.entries()].sort((a, b) => (order.get(a[0]) ?? 99) - (order.get(b[0]) ?? 99));
  const total = empty();
  for (const [, v] of rows) add(total, v.cell);
  const adjustments = txs.filter((t) => t.budgetAdjust);

  const ledgerHref = `/projects/${projectId}/years/${projectYearId}/ledger`;

  return (
    <div className="mx-auto min-w-0 w-full max-w-6xl">
      <Link href={ledgerHref} className="text-sm text-slate-400 hover:text-slate-700">
        ← 집행 원장
      </Link>
      <h1 className="mt-2 break-keep text-2xl font-bold text-slate-900">
        예산표 — {year.yearNo}년차
        <span className="ml-2 text-base font-normal text-slate-400">{year.project.code ?? ""}</span>
      </h1>
      <p className="mt-1 break-keep text-sm text-slate-500">{year.project.name}</p>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">현재 편성 (현금)</p>
          <p className="mt-1 text-lg font-bold text-blue-700">{won(current(total))}</p>
          {current(total) !== year.budgetCash && (
            <p className="mt-1 text-xs text-amber-700">연차 예산 {won(year.budgetCash)} 과 다름</p>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">편성 조정 합계</p>
          <p className="mt-1 text-lg font-bold text-violet-700">{total.adjust === 0 ? "0원" : `${signed(total.adjust)}원`}</p>
          <p className="mt-1 text-xs text-slate-400">조정 {adjustments.length}건 (재배분이면 0)</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">집행 (신청 중 포함)</p>
          <p className="mt-1 text-lg font-bold text-red-600">{won(total.spent)}</p>
          {total.pending > 0 && <p className="mt-1 text-xs text-amber-700">그중 신청 중 {won(total.pending)}</p>}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">잔액 · 집행률</p>
          <p className="mt-1 text-lg font-bold text-slate-900">
            {won(current(total) - total.spent)}
            <span className="ml-2 text-sm font-medium text-slate-400">{executionRate(total.spent, current(total))}%</span>
          </p>
        </div>
      </div>

      <div className="mt-5 max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
              <th className="px-3 py-2.5 font-medium">비목 / 세목</th>
              <th className="px-3 py-2.5 text-right font-medium">최초 편성</th>
              <th className="px-3 py-2.5 text-right font-medium">조정</th>
              <th className="px-3 py-2.5 text-right font-medium">현재 편성</th>
              <th className="px-3 py-2.5 text-right font-medium">집행</th>
              <th className="px-3 py-2.5 text-right font-medium">잔액</th>
              <th className="px-3 py-2.5 text-right font-medium">집행률</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([item, v]) => (
              <BudgetGroup key={item} item={item} v={v} />
            ))}
            <Line label="합계" c={total} strong />
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        단위 원 · 현금 편성 기준(현물·위탁은 장부에 없음) · 부가세는 회사 부담이라 제외 · 취소 거래 제외. 세목 없이 비목 단위로 편성된 금액은 &quot;(비목 공통)&quot;으로 표시합니다.
      </p>

      <h2 className="mt-8 text-lg font-bold text-slate-900">편성 조정 이력 ({adjustments.length})</h2>
      {adjustments.length === 0 ? (
        <p className="mt-2 rounded-lg bg-slate-100 px-4 py-4 text-sm text-slate-500">조정 기록이 없습니다.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {adjustments.map((t) => (
            <li key={t.id} className="flex flex-col gap-1 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:gap-4">
              <span className="w-24 shrink-0 text-slate-500">{ymd(t.date)}</span>
              <span className="min-w-0 flex-1 break-keep text-slate-700">{t.description}</span>
              <span className={`shrink-0 font-semibold tabular-nums text-violet-700`}>
                {t.direction === "IN" ? "+" : "−"}{won(t.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BudgetGroup({
  item,
  v,
}: {
  item: string;
  v: { cell: Cell; subs: Map<string, Cell> };
}) {
  const subs = [...v.subs.entries()].sort((a, b) => (a[0] === "(비목 공통)" ? -1 : b[0] === "(비목 공통)" ? 1 : a[0].localeCompare(b[0], "ko")));
  return (
    <>
      <Line label={item} c={v.cell} strong />
      {(subs.length > 1 || subs[0]?.[0] !== "(비목 공통)") &&
        subs.map(([name, c]) => <Line key={name} label={name} c={c} indent />)}
    </>
  );
}
