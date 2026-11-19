"use client";

// 협약변경 편집기 — "변경 후"를 넣으면 증감·점검(오류/사전승인/통보)·대비표가 바로 바뀐다. 반영은 저장된 내용으로만.
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { review, subKey, totals, type AmendFund, type AmendLine, type Finding } from "@/lib/amendment";
import { STANDARD_TREE, normalizeCategoryName } from "@/lib/budgetStandard";
import AmendmentComparison, { comparisonTsv } from "@/components/AmendmentComparison";
import type { ActResult } from "@/app/projects/[id]/years/[yearId]/amendments/actions";

type Unit = "won" | "thousand";
const cell = "rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-900";
const ITEMS = [...STANDARD_TREE.map((t) => t.item)];

/** 입력값 → 원. 천원 단위면 소수 셋째 자리까지 받는다 */
function parseMoney(s: string, unit: Unit): number | null {
  const t = s.replace(/[,\s]/g, "");
  if (t === "") return 0;
  if (unit === "won") return /^\d+$/.test(t) ? Number(t) : null;
  if (!/^\d+(\.\d{0,3})?$/.test(t)) return null;
  const [i, f = ""] = t.split(".");
  return Number(i) * 1000 + Number((f + "000").slice(0, 3));
}
const show = (v: number, unit: Unit) =>
  unit === "won" ? v.toLocaleString("ko-KR") : (v / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 3 });

const LEVEL: Record<Finding["level"], { cls: string; icon: string }> = {
  error: { cls: "border-red-200 bg-red-50 text-red-800", icon: "⛔" },
  approval: { cls: "border-amber-200 bg-amber-50 text-amber-900", icon: "📮" },
  warn: { cls: "border-slate-200 bg-slate-50 text-slate-700", icon: "⚠️" },
  ok: { cls: "border-green-200 bg-green-50 text-green-800", icon: "✅" },
};

export function Findings({ findings }: { findings: Finding[] }) {
  if (!findings.length) return null;
  return (
    <ul className="space-y-1.5">
      {findings.map((f, i) => (
        <li key={i} className={`flex gap-2 rounded-lg border px-3 py-2 text-sm ${LEVEL[f.level].cls}`}>
          <span>{LEVEL[f.level].icon}</span>
          <span className="break-keep">{f.text}</span>
        </li>
      ))}
    </ul>
  );
}

export default function AmendmentEditor({
  amendmentId,
  initial,
  spentBySub,
  spentByItem,
  subjectLabel,
  save,
  apply,
  reload,
  remove,
}: {
  amendmentId: string;
  initial: { title: string; effectiveDate: string; reason: string; lines: AmendLine[] };
  spentBySub: [string, number][];
  spentByItem: [string, number][];
  subjectLabel: string;
  save: (input: { amendmentId: string; title: string; effectiveDate: string; reason: string; lines: Omit<AmendLine, "key">[] }) => Promise<ActResult>;
  apply: (id: string) => Promise<ActResult>;
  reload: (id: string) => Promise<ActResult>;
  remove: (id: string) => Promise<ActResult>;
}) {
  const router = useRouter();
  const seq = useRef(0);
  const [title, setTitle] = useState(initial.title);
  const [date, setDate] = useState(initial.effectiveDate);
  const [reason, setReason] = useState(initial.reason);
  const [lines, setLines] = useState<AmendLine[]>(initial.lines);
  const [unit, setUnit] = useState<Unit>("thousand");
  const [text, setText] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const subMap = useMemo(() => new Map(spentBySub), [spentBySub]);
  const itemMap = useMemo(() => new Map(spentByItem), [spentByItem]);
  const findings = review(lines, subMap, itemMap);
  const hasError = findings.some((f) => f.level === "error");
  const t = totals(lines);

  const patch = (key: string, p: Partial<AmendLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...p } : l)));
    setDirty(true);
  };
  const add = () => {
    setLines((prev) => [
      ...prev,
      { key: `new-${seq.current++}`, itemName: "", subName: null, detailName: null, fundType: "CASH", inLedger: true, beforeAmt: 0, afterAmt: 0, note: null },
    ]);
    setDirty(true);
  };
  const del = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
    setDirty(true);
  };

  const run = async (label: string, fn: () => Promise<ActResult>, refresh = true) => {
    setBusy(label);
    setMsg(null);
    const r = await fn();
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: r.text ?? "완료" } : { ok: false, text: r.error });
    if (r.ok && refresh) router.refresh();
    return r;
  };
  const doSave = async () => {
    const r = await run("save", () =>
      save({ amendmentId, title, effectiveDate: date, reason, lines: lines.map(({ key: _k, ...l }) => { void _k; return l; }) }),
    );
    if (r.ok) setDirty(false);
  };
  const doApply = async () => {
    if (dirty) return setMsg({ ok: false, text: "먼저 저장하세요." });
    const n = lines.filter((l) => l.inLedger && l.afterAmt !== l.beforeAmt).length;
    if (!window.confirm(`장부에 조정 레코드 ${n}건을 추가합니다. 원 편성은 그대로 두고, 반영 취소하면 이 레코드만 지워집니다. 반영할까요?`)) return;
    await run("apply", () => apply(amendmentId));
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(comparisonTsv(lines, unit));
      setMsg({ ok: true, text: "대비표를 복사했습니다. 엑셀·한글 표에 붙여넣으세요." });
    } catch {
      setMsg({ ok: false, text: "복사하지 못했습니다." });
    }
  };

  const subsOf = (item: string) =>
    STANDARD_TREE.find((x) => normalizeCategoryName(x.item) === normalizeCategoryName(item))?.subs.map((s) => s.name) ?? [];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-[2fr_1fr_auto]">
        <label className="block text-xs font-medium text-slate-600">
          제목
          <input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} className={`${cell} mt-1 w-full`} />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          변경 기준일
          <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setDirty(true); }} className={`${cell} mt-1 w-full`} />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          금액 단위
          <select value={unit} onChange={(e) => { setUnit(e.target.value as Unit); setText({}); }} className={`${cell} mt-1 w-full`}>
            <option value="thousand">천원</option>
            <option value="won">원</option>
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-600 md:col-span-3">
          변경 사유
          <textarea value={reason} rows={2} onChange={(e) => { setReason(e.target.value); setDirty(true); }} placeholder="예: 클라우드 사용량 감소분을 내부인건비(신규 채용)로 재배분" className={`${cell} mt-1 w-full`} />
        </label>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-bold text-slate-900">비목·세목별 변경</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={add} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100">+ 줄 추가</button>
            <button type="button" disabled={!!busy || dirty} title={dirty ? "먼저 저장하세요" : ""} onClick={() => run("reload", () => reload(amendmentId))} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40">
              ↻ 변경 전 다시 불러오기
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm [&_th]:whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-3 py-2 font-medium">비목</th>
                <th className="px-3 py-2 font-medium">세목</th>
                <th className="px-3 py-2 font-medium">세세목</th>
                <th className="px-3 py-2 font-medium">구분</th>
                <th className="px-3 py-2 font-medium" title="체크하면 반영할 때 장부(현금 원장)에 조정 레코드를 만든다. 현물·위탁 등 장부에 없는 줄은 대비표 기록용">장부</th>
                <th className="px-3 py-2 text-right font-medium">변경 전</th>
                <th className="px-3 py-2 text-right font-medium">변경 후</th>
                <th className="px-3 py-2 text-right font-medium">증감</th>
                <th className="px-3 py-2 text-right font-medium">집행(신청 포함)</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const d = l.afterAmt - l.beforeAmt;
                const spent = l.inLedger ? subMap.get(subKey(l.itemName, l.subName)) ?? 0 : 0;
                const tKey = (f: "b" | "a") => `${l.key}:${f}`;
                const moneyInput = (f: "b" | "a", value: number, onSet: (v: number) => void, readOnly = false) => (
                  <input
                    inputMode="decimal"
                    readOnly={readOnly}
                    value={text[tKey(f)] ?? show(value, unit)}
                    onChange={(e) => {
                      const s = e.target.value;
                      setText((p) => ({ ...p, [tKey(f)]: s }));
                      const v = parseMoney(s, unit);
                      if (v !== null) onSet(v);
                    }}
                    onBlur={() => setText((p) => { const n = { ...p }; delete n[tKey(f)]; return n; })}
                    title={readOnly ? "장부 줄의 변경 전은 지금 장부 편성입니다" : undefined}
                    className={`${cell} w-32 text-right ${readOnly ? "bg-slate-50 text-slate-500" : ""} ${text[tKey(f)] !== undefined && parseMoney(text[tKey(f)], unit) === null ? "border-red-400" : ""}`}
                  />
                );
                return (
                  <tr key={l.key} className={`border-b border-slate-100 last:border-0 ${d ? "bg-blue-50/30" : ""}`}>
                    <td className="px-3 py-2">
                      <input list="amend-items" value={l.itemName} onChange={(e) => patch(l.key, { itemName: e.target.value })} className={`${cell} w-36 ${l.itemName ? "" : "border-amber-400 bg-amber-50"}`} placeholder="비목" />
                    </td>
                    <td className="px-3 py-2">
                      <input list={`amend-subs-${l.key}`} value={l.subName ?? ""} onChange={(e) => patch(l.key, { subName: e.target.value || null })} className={`${cell} w-48`} placeholder="(비목 공통)" />
                      <datalist id={`amend-subs-${l.key}`}>{subsOf(l.itemName).map((s) => <option key={s} value={s} />)}</datalist>
                    </td>
                    <td className="px-3 py-2">
                      <input value={l.detailName ?? ""} onChange={(e) => patch(l.key, { detailName: e.target.value || null })} className={`${cell} w-32`} placeholder="-" />
                    </td>
                    <td className="px-3 py-2">
                      <select value={l.fundType} onChange={(e) => patch(l.key, { fundType: e.target.value as AmendFund, inLedger: e.target.value === "CASH" ? l.inLedger : false })} className={cell}>
                        <option value="CASH">현금</option>
                        <option value="IN_KIND">현물</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={l.inLedger} disabled={l.fundType !== "CASH"} onChange={(e) => patch(l.key, { inLedger: e.target.checked })} />
                    </td>
                    <td className="px-3 py-2 text-right">{moneyInput("b", l.beforeAmt, (v) => patch(l.key, { beforeAmt: v }), l.inLedger && !l.key.startsWith("new-"))}</td>
                    <td className="px-3 py-2 text-right">{moneyInput("a", l.afterAmt, (v) => patch(l.key, { afterAmt: v }))}</td>
                    <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold ${d > 0 ? "text-blue-700" : d < 0 ? "text-red-600" : "text-slate-300"}`}>
                      {d === 0 ? "-" : `${d > 0 ? "+" : "−"}${show(Math.abs(d), unit)}`}
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2 text-right text-xs ${spent > l.afterAmt ? "font-semibold text-red-600" : "text-slate-500"}`}>{l.inLedger ? show(spent, unit) : "-"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <button type="button" onClick={() => del(l.key)} className="text-xs font-medium text-red-600 hover:underline">삭제</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                <td colSpan={5} className="px-3 py-2.5 text-right text-slate-600">합계 ({unit === "thousand" ? "천원" : "원"})</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">{show(t.before, unit)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">{show(t.after, unit)}</td>
                <td className={`whitespace-nowrap px-3 py-2.5 text-right ${t.after === t.before ? "text-green-700" : "text-amber-700"}`}>
                  {t.after === t.before ? "총액 동일" : `${t.after > t.before ? "+" : "−"}${show(Math.abs(t.after - t.before), unit)}`}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
          <datalist id="amend-items">{ITEMS.map((i) => <option key={i} value={i} />)}</datalist>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold text-slate-900">점검</h2>
        <Findings findings={findings} />
      </section>

      <AmendmentComparison lines={lines} unit={unit} subtitle={subjectLabel} />

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 border-t border-slate-200 bg-slate-50/95 px-1 py-3 backdrop-blur">
        <button type="button" onClick={doSave} disabled={!!busy} className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
          {busy === "save" ? "저장 중…" : "저장"}
        </button>
        <button
          type="button"
          onClick={doApply}
          disabled={!!busy || hasError || dirty}
          title={hasError ? "점검 오류를 먼저 고치세요" : dirty ? "먼저 저장하세요" : "장부에 조정 레코드를 추가합니다"}
          className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
        >
          {busy === "apply" ? "반영 중…" : "✅ 장부에 반영"}
        </button>
        <button type="button" onClick={copy} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">📋 대비표 복사</button>
        <button
          type="button"
          onClick={() => { if (window.confirm("이 초안을 지울까요?")) void run("delete", () => remove(amendmentId), false); }}
          disabled={!!busy}
          className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:underline"
        >
          초안 삭제
        </button>
        {dirty && !busy && <span className="text-xs text-amber-700">저장하지 않은 변경이 있습니다.</span>}
        {msg && <span className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
