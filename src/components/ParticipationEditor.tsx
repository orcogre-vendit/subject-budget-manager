"use client";

// 참여율 계산 편집기 — 표에서 바로 고치고, 현금·현물 그룹별로 참여율을 자동 계산한다. 계산은 src/lib/participation.ts (정수 연산)
import { useMemo, useRef, useState } from "react";
import {
  FUND_LABEL,
  FULL_BP,
  baseAmount,
  fitExact,
  fmtRate,
  monthlyPay,
  monthsBetween,
  parseRate,
  rateByResearcher,
  rowAmount,
  solveRates,
  type FundType,
  type PlanRow,
  type SolveMode,
} from "@/lib/participation";
import type { SaveResult } from "@/app/researchers/participation/actions";

type Row = PlanRow & { role: string };
type Researcher = { id: string; name: string; title: string | null };

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const digits = (s: string) => s.replace(/\D/g, "");
const toInt = (s: string) => (digits(s) ? Number(digits(s)) : 0);
const cell = "rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-900";

const UNITS = [
  { bp: 100, label: "1%" },
  { bp: 10, label: "0.1%" },
  { bp: 1, label: "0.01%" },
];

export default function ParticipationEditor({
  projectYearId,
  projectName,
  defaultStart,
  defaultEnd,
  ledgerCash,
  savedCashTarget,
  savedInKindTarget,
  researchers,
  initialRows,
  save,
}: {
  projectYearId: string;
  projectName: string;
  defaultStart: string;
  defaultEnd: string;
  ledgerCash: number;
  savedCashTarget: number | null;
  savedInKindTarget: number | null;
  researchers: Researcher[];
  initialRows: Row[];
  save: (input: {
    projectYearId: string;
    cashTarget: number | null;
    inKindTarget: number | null;
    rows: (Omit<Row, "key">)[];
  }) => Promise<SaveResult>;
}) {
  const seq = useRef(0);
  const newKey = () => `new-${seq.current++}`;
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [cashTarget, setCashTarget] = useState(savedCashTarget === null ? "" : String(savedCashTarget));
  const [inKindTarget, setInKindTarget] = useState(savedInKindTarget === null ? "" : String(savedInKindTarget));
  const [unit, setUnit] = useState(100);
  const [mode, setMode] = useState<SolveMode>("uniform");
  const [rateText, setRateText] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const targets: Record<FundType, number> = {
    CASH: cashTarget === "" ? ledgerCash : toInt(cashTarget),
    IN_KIND: toInt(inKindTarget),
  };
  const nameOf = useMemo(() => new Map(researchers.map((r) => [r.id, r.name])), [researchers]);

  const update = (key: string, patch: Partial<Row>) => {
    // 계상액에 영향을 주는 값을 바꾸면 끝전 맞춤은 풀린다
    const affects = "baseSalary" in patch || "rateBp" in patch || "startMonth" in patch || "endMonth" in patch;
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch, ...(affects ? { amountOverride: null } : {}) } : r)));
    setDirty(true);
  };
  const addRow = (fundType: FundType) => {
    setRows((prev) => [
      ...prev,
      { key: newKey(), researcherId: "", fundType, role: "", startMonth: defaultStart, endMonth: defaultEnd, baseSalary: 0, rateBp: 0, locked: false, amountOverride: null },
    ]);
    setDirty(true);
  };
  const removeRow = (key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
    setDirty(true);
  };
  const fit = (fundType: FundType) => {
    const res = fitExact(rows, fundType, targets[fundType]);
    if (!res.ok) {
      setStatus({ ok: false, text: `${FUND_LABEL[fundType]}: ${res.reason}` });
      return;
    }
    const who = nameOf.get(rows.find((r) => r.key === res.key)?.researcherId ?? "") ?? "마지막 사람";
    setRows(res.rows as Row[]);
    setRateText({});
    setDirty(true);
    setStatus({
      ok: true,
      text: `${FUND_LABEL[fundType]}: ${who} 참여율 ${fmtRate(res.rateBp)}%${res.remainder ? `, 끝전 +${res.remainder.toLocaleString("ko-KR")}원` : ""} → 목표와 딱 맞음 (🔒 고정됨)`,
    });
  };
  const solve = (fundType: FundType) => {
    setRows((prev) => solveRates(prev, fundType, targets[fundType], unit, mode) as Row[]);
    setRateText({});
    setDirty(true);
  };

  const groups: FundType[] = ["CASH", "IN_KIND"];
  const sumOf = (f: FundType) => rows.filter((r) => r.fundType === f).reduce((s, r) => s + rowAmount(r), 0);
  const perPerson = rateByResearcher(rows.filter((r) => r.researcherId));

  const onSave = async () => {
    setSaving(true);
    setStatus(null);
    const res = await save({
      projectYearId,
      cashTarget: cashTarget === "" ? null : toInt(cashTarget),
      inKindTarget: inKindTarget === "" ? null : toInt(inKindTarget),
      rows: rows.map((r) => ({
        researcherId: r.researcherId,
        fundType: r.fundType,
        role: r.role,
        startMonth: r.startMonth,
        endMonth: r.endMonth,
        baseSalary: r.baseSalary,
        rateBp: r.rateBp,
        locked: r.locked,
        amountOverride: r.amountOverride ?? null,
      })),
    });
    setSaving(false);
    if (res.ok) {
      setDirty(false);
      setStatus({ ok: true, text: "저장했습니다." });
    } else setStatus({ ok: false, text: res.error });
  };

  /** 엑셀·한글 표에 붙여넣기용 (탭 구분) */
  const copyTable = async () => {
    const head = ["구분", "성명", "역할", "참여시작", "참여종료", "개월", "기준연봉", "참여율(%)", "월 인건비", "계상액", "끝전"];
    const lines = rows.map((r) =>
      [FUND_LABEL[r.fundType], nameOf.get(r.researcherId) ?? "", r.role, r.startMonth, r.endMonth, monthsBetween(r.startMonth, r.endMonth), r.baseSalary, fmtRate(r.rateBp), monthlyPay(r.baseSalary, r.rateBp), rowAmount(r), rowAmount(r) - baseAmount(r) || ""].join("\t"),
    );
    try {
      await navigator.clipboard.writeText([head.join("\t"), ...lines].join("\n"));
      setStatus({ ok: true, text: "표를 복사했습니다. 엑셀에 붙여넣으세요." });
    } catch {
      setStatus({ ok: false, text: "복사하지 못했습니다." });
    }
  };

  return (
    <div className="mt-5 space-y-5">
      {/* 목표 + 계산 옵션 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">현금 인건비 목표</p>
          <input
            inputMode="numeric"
            value={cashTarget === "" ? "" : toInt(cashTarget).toLocaleString("ko-KR")}
            placeholder={ledgerCash.toLocaleString("ko-KR")}
            onChange={(e) => { setCashTarget(digits(e.target.value)); setDirty(true); }}
            className={`${cell} mt-1 w-full text-base`}
          />
          <p className="mt-1 text-[11px] text-slate-400">
            비우면 예산표의 내부인건비(현금) 현재 편성 {won(ledgerCash)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">현물 인건비 목표</p>
          <input
            inputMode="numeric"
            value={inKindTarget === "" ? "" : toInt(inKindTarget).toLocaleString("ko-KR")}
            placeholder="협약서의 내부인건비(현물)"
            onChange={(e) => { setInKindTarget(digits(e.target.value)); setDirty(true); }}
            className={`${cell} mt-1 w-full text-base`}
          />
          <p className="mt-1 text-[11px] text-slate-400">현물은 장부에 없어 직접 입력합니다.</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">자동 계산 방식</p>
          <div className="mt-1 grid grid-cols-1 gap-2 text-sm">
            <select value={unit} onChange={(e) => setUnit(Number(e.target.value))} className={`${cell} w-full`}>
              {UNITS.map((u) => <option key={u.bp} value={u.bp}>참여율 {u.label} 단위</option>)}
            </select>
            <select value={mode} onChange={(e) => setMode(e.target.value as SolveMode)} className={`${cell} w-full`}>
              <option value="uniform">모두 같은 참여율</option>
              <option value="fill">잔액 최소 (사람마다 다를 수 있음)</option>
            </select>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">🔒 고정한 줄은 그대로 두고 나머지만 맞춥니다.</p>
          <p className="mt-1 text-[11px] text-slate-400">기준연봉은 이 과제·연차 계산에만 저장됩니다. 과제마다 달라도 됩니다.</p>
        </div>
      </div>

      {groups.map((g) => {
        const list = rows.filter((r) => r.fundType === g);
        const sum = sumOf(g);
        const left = targets[g] - sum;
        return (
          <section key={g} className="rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <h2 className="text-base font-bold text-slate-900">
                {FUND_LABEL[g]} 인건비
                <span className="ml-2 text-sm font-normal text-slate-500">목표 {won(targets[g])}</span>
              </h2>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => addRow(g)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
                  + 연구원 추가
                </button>
                <button
                  type="button"
                  onClick={() => solve(g)}
                  disabled={!list.length || targets[g] <= 0}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
                >
                  🧮 {FUND_LABEL[g]} 참여율 자동 계산
                </button>
                <button
                  type="button"
                  onClick={() => fit(g)}
                  disabled={!list.length || targets[g] <= 0}
                  title="마지막 줄의 참여율을 0.01% 단위로 올리고, 남는 끝전을 그 사람 계상액에 얹어 목표와 원 단위까지 맞춥니다"
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
                >
                  🎯 마지막 사람으로 딱 맞추기
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm [&_th]:whitespace-nowrap">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                    <th className="px-3 py-2 font-medium">연구원</th>
                    <th className="px-3 py-2 font-medium">역할</th>
                    <th className="px-3 py-2 font-medium">참여기간</th>
                    <th className="px-3 py-2 text-right font-medium">개월</th>
                    <th className="px-3 py-2 text-right font-medium" title="연봉은 이 과제·연차 계산에만 저장됩니다. 같은 연구원이라도 과제마다 다르게 넣을 수 있고, 연구원 명단에는 저장되지 않습니다.">
                      기준연봉 <span className="font-normal text-slate-400">(이 과제 기준)</span>
                    </th>
                    <th className="px-3 py-2 text-right font-medium">참여율(%)</th>
                    <th className="px-3 py-2 text-right font-medium">월 인건비</th>
                    <th className="px-3 py-2 text-right font-medium">계상액</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {list.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-3 py-6 text-center text-sm text-slate-400">
                        &quot;+ 연구원 추가&quot; 로 {FUND_LABEL[g]} 참여 연구원을 넣으세요.
                      </td>
                    </tr>
                  )}
                  {list.map((r) => {
                    const months = monthsBetween(r.startMonth, r.endMonth);
                    const over = (perPerson.get(r.researcherId) ?? 0) > FULL_BP;
                    return (
                      <tr key={r.key} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2">
                          <select value={r.researcherId} onChange={(e) => update(r.key, { researcherId: e.target.value })} className={`${cell} w-36 ${r.researcherId ? "" : "border-amber-400 bg-amber-50"}`}>
                            <option value="">선택</option>
                            {researchers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input value={r.role} onChange={(e) => update(r.key, { role: e.target.value })} placeholder="참여연구원" className={`${cell} w-28`} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <input type="month" value={r.startMonth} onChange={(e) => update(r.key, { startMonth: e.target.value })} className={`${cell} w-36`} />
                          <span className="mx-1 text-slate-400">~</span>
                          <input type="month" value={r.endMonth} onChange={(e) => update(r.key, { endMonth: e.target.value })} className={`${cell} w-36`} />
                        </td>
                        <td className={`whitespace-nowrap px-3 py-2 text-right ${months ? "text-slate-700" : "font-semibold text-red-600"}`}>{months || "기간 오류"}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            inputMode="numeric"
                            value={r.baseSalary ? r.baseSalary.toLocaleString("ko-KR") : ""}
                            placeholder="0"
                            onChange={(e) => update(r.key, { baseSalary: toInt(e.target.value) })}
                            className={`${cell} w-36 text-right`}
                          />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <input
                            inputMode="decimal"
                            value={rateText[r.key] ?? fmtRate(r.rateBp)}
                            onChange={(e) => {
                              const t = e.target.value;
                              setRateText((p) => ({ ...p, [r.key]: t }));
                              const bp = parseRate(t);
                              if (bp !== null) update(r.key, { rateBp: bp });
                            }}
                            onBlur={() => setRateText((p) => { const n = { ...p }; delete n[r.key]; return n; })}
                            className={`${cell} w-20 text-right ${over ? "border-red-400 bg-red-50 text-red-700" : ""} ${rateText[r.key] !== undefined && parseRate(rateText[r.key]) === null ? "border-red-400" : ""}`}
                          />
                          <button
                            type="button"
                            onClick={() => update(r.key, { locked: !r.locked })}
                            title={r.locked ? "고정됨 — 자동 계산에서 제외" : "고정하지 않음 — 자동 계산 대상"}
                            className={`ml-1 rounded-md px-1.5 py-1 text-sm ${r.locked ? "bg-slate-900 text-white" : "text-slate-300 hover:text-slate-600"}`}
                          >
                            🔒
                          </button>
                          {over && <p className="mt-0.5 text-[10px] font-semibold text-red-600">이 사람 합계 {fmtRate(perPerson.get(r.researcherId) ?? 0)}% (100% 초과)</p>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right text-slate-600">{monthlyPay(r.baseSalary, r.rateBp).toLocaleString("ko-KR")}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-slate-900">
                          {rowAmount(r).toLocaleString("ko-KR")}
                          {r.amountOverride != null && r.amountOverride !== baseAmount(r) && (
                            <span className="block text-[10px] font-semibold text-emerald-700" title="목표와 원 단위까지 맞추려고 얹은 금액">
                              끝전 {r.amountOverride - baseAmount(r) > 0 ? "+" : ""}{(r.amountOverride - baseAmount(r)).toLocaleString("ko-KR")}원
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <button type="button" onClick={() => removeRow(r.key)} className="text-xs font-medium text-red-600 hover:underline">삭제</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-semibold">
                    <td colSpan={7} className="px-3 py-2.5 text-right text-slate-600">계상 합계</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-slate-900">{sum.toLocaleString("ko-KR")}</td>
                    <td />
                  </tr>
                  <tr className="bg-slate-50">
                    <td colSpan={7} className="px-3 py-2 text-right text-xs text-slate-500">목표 − 합계</td>
                    <td className={`whitespace-nowrap px-3 py-2 text-right text-sm font-semibold ${left < 0 ? "text-red-600" : left === 0 ? "text-green-700" : "text-amber-700"}`}>
                      {left === 0 ? "딱 맞음" : left < 0 ? `${(-left).toLocaleString("ko-KR")} 초과` : `${left.toLocaleString("ko-KR")} 남음`}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        );
      })}

      {/* 사람별 합계 */}
      {perPerson.size > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-bold text-slate-900">연구원별 참여율 합계</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {[...perPerson.entries()].map(([id, bp]) => {
              const cashBp = rows.filter((r) => r.researcherId === id && r.fundType === "CASH").reduce((s, r) => s + r.rateBp, 0);
              const kindBp = bp - cashBp;
              return (
                <li key={id} className={`rounded-lg border px-3 py-2 text-sm ${bp > FULL_BP ? "border-red-300 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                  <b>{nameOf.get(id) ?? "?"}</b> {fmtRate(bp)}%
                  <span className="ml-1 text-xs text-slate-500">(현금 {fmtRate(cashBp)} · 현물 {fmtRate(kindBp)})</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[11px] text-slate-400">이 과제 연차 안의 합계입니다. 다른 과제 참여분은 따로 확인하세요 (연구자 총 참여율 100% 이내).</p>
        </section>
      )}

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 border-t border-slate-200 bg-slate-50/95 px-1 py-3 backdrop-blur">
        <button type="button" onClick={onSave} disabled={saving} className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
          {saving ? "저장 중…" : "저장"}
        </button>
        <button type="button" onClick={copyTable} disabled={!rows.length} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40">
          📋 표 복사 (엑셀용)
        </button>
        {dirty && !saving && <span className="text-xs text-amber-700">저장하지 않은 변경이 있습니다.</span>}
        {status && <span className={`text-sm ${status.ok ? "text-green-700" : "text-red-600"}`}>{status.text}</span>}
        <span className="ml-auto hidden text-xs text-slate-400 md:inline">{projectName}</span>
      </div>
    </div>
  );
}
