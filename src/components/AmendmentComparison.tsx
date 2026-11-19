// 변경 전/후 비목별 대비표 — 협약변경 첨부3 형식. 서버·클라이언트 어디서나 쓰는 표시 전용 컴포넌트
import { fmtThousand, isItem, totals, type AmendLine } from "@/lib/amendment";

type Unit = "thousand" | "won";
type Row = { label: string; before: number; after: number; depth: 0 | 1; isNew: boolean; fund?: string };

const money = (v: number, unit: Unit) => (unit === "thousand" ? fmtThousand(v) : v.toLocaleString("ko-KR"));
const delta = (v: number, unit: Unit) => (v === 0 ? "0" : `${v > 0 ? "+" : "−"}${money(Math.abs(v), unit)}`);

/** 대비표 행 만들기 — 인건비는 세목(현금/현물)을 바로 위 줄로, 나머지는 비목 합계 + 세목·세세목 아래 줄 */
export function comparisonRows(lines: Pick<AmendLine, "itemName" | "subName" | "detailName" | "fundType" | "beforeAmt" | "afterAmt">[]): Row[] {
  const order: string[] = [];
  const groups = new Map<string, typeof lines>();
  for (const l of lines) {
    const k = l.itemName.trim();
    if (!groups.has(k)) {
      groups.set(k, []);
      order.push(k);
    }
    groups.get(k)!.push(l);
  }
  const rows: Row[] = [];
  for (const item of order) {
    const g = groups.get(item)!;
    const sum = g.reduce((t, l) => ({ before: t.before + l.beforeAmt, after: t.after + l.afterAmt }), { before: 0, after: 0 });
    if (isItem({ itemName: item }, "인건비")) {
      for (const l of g) rows.push({ label: l.subName || item, before: l.beforeAmt, after: l.afterAmt, depth: 0, isNew: l.beforeAmt === 0 && l.afterAmt > 0 });
      continue;
    }
    rows.push({ label: item, before: sum.before, after: sum.after, depth: 0, isNew: sum.before === 0 && sum.after > 0 });
    if (g.length > 1) {
      for (const l of g) {
        const label = l.detailName ? l.detailName : l.subName ?? "(비목 공통)";
        rows.push({ label, before: l.beforeAmt, after: l.afterAmt, depth: 1, isNew: l.beforeAmt === 0 && l.afterAmt > 0 });
      }
    }
  }
  return rows;
}

export function comparisonTsv(lines: Parameters<typeof comparisonRows>[0], unit: Unit): string {
  const head = ["비목", `변경 전(${unit === "thousand" ? "천원" : "원"})`, `변경 후(${unit === "thousand" ? "천원" : "원"})`, `증감(${unit === "thousand" ? "천원" : "원"})`];
  const rows = comparisonRows(lines).map((r) => [`${r.depth ? "  - " : ""}${r.label}${r.isNew ? " (신설)" : ""}`, money(r.before, unit), money(r.after, unit), delta(r.after - r.before, unit)].join("\t"));
  const t = totals(lines as AmendLine[]);
  return [head.join("\t"), ...rows, ["합계", money(t.before, unit), money(t.after, unit), delta(t.after - t.before, unit)].join("\t")].join("\n");
}

export default function AmendmentComparison({
  lines,
  unit = "thousand",
  title = "변경 전/후 비목별 대비표",
  subtitle,
}: {
  lines: Parameters<typeof comparisonRows>[0];
  unit?: Unit;
  title?: string;
  subtitle?: string;
}) {
  const rows = comparisonRows(lines);
  const t = totals(lines as AmendLine[]);
  const cash = totals(lines as AmendLine[], (l) => l.fundType === "CASH");
  const kind = totals(lines as AmendLine[], (l) => l.fundType === "IN_KIND");
  const u = unit === "thousand" ? "천원" : "원";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 print:border-0 print:p-0">
      <h2 className="text-center text-lg font-bold text-slate-900">{title}</h2>
      {subtitle && <p className="mt-1 text-center text-xs text-slate-500">{subtitle}</p>}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm [&_td]:border [&_td]:border-slate-300 [&_th]:border [&_th]:border-slate-300 [&_th]:whitespace-nowrap">
          <thead>
            <tr className="bg-slate-100">
              <th className="px-3 py-2 text-left">비목</th>
              <th className="px-3 py-2 text-right">변경 전({u})</th>
              <th className="px-3 py-2 text-right">변경 후({u})</th>
              <th className="px-3 py-2 text-right">증감({u})</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={r.depth ? "text-slate-600" : "font-medium text-slate-900"}>
                <td className={`px-3 py-1.5 ${r.depth ? "pl-7" : ""}`}>
                  {r.depth ? "- " : ""}
                  {r.label}
                  {r.isNew && <span className="ml-1 text-xs text-emerald-700">(신설)</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{money(r.before, unit)}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{money(r.after, unit)}</td>
                <td className={`whitespace-nowrap px-3 py-1.5 text-right tabular-nums ${r.after - r.before > 0 ? "text-blue-700" : r.after - r.before < 0 ? "text-red-600" : "text-slate-400"}`}>
                  {delta(r.after - r.before, unit)}
                </td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-bold">
              <td className="px-3 py-2">합계</td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(t.before, unit)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(t.after, unit)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{delta(t.after - t.before, unit)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        현금 {money(cash.before, unit)} → {money(cash.after, unit)} · 현물 {money(kind.before, unit)} → {money(kind.after, unit)} ({u})
        {t.after === t.before && " · 연구개발비 총액 변동 없음"}
      </p>
    </div>
  );
}
