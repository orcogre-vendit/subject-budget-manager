"use client";

import { useState } from "react";

export type ItemRow = { name: string; spec: string; quantity: string; unitPrice: string };

const fmt = (digits: string) => (digits ? Number(digits).toLocaleString("ko-KR") : "");
const digitsOf = (s: string) => s.replace(/\D/g, "");
const cell =
  "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-900";

export const emptyRow = (): ItemRow => ({ name: "", spec: "", quantity: "1", unitPrice: "" });

/** 초기 rows 로부터 정수 합계 (수량×단가) */
export function itemsTotal(rows: ItemRow[]): number {
  return rows.reduce((s, r) => {
    if (!r.name.trim()) return s;
    const q = Math.trunc(Number(r.quantity) || 0);
    const u = Math.trunc(Number(digitsOf(r.unitPrice)) || 0);
    return s + q * u;
  }, 0);
}

/**
 * 거래 품목 편집기 — 품목명/규격/수량/단가 다건 입력.
 * hidden input `items` 에 JSON 으로 직렬화하고, 합계가 바뀌면 onTotalChange 로 알린다.
 */
export default function ItemsEditor({
  initial,
  onTotalChange,
  error,
}: {
  initial: ItemRow[];
  onTotalChange?: (total: number) => void;
  error?: string;
}) {
  const [rows, setRows] = useState<ItemRow[]>(initial.length ? initial : [emptyRow()]);

  const commit = (next: ItemRow[]) => {
    setRows(next);
    onTotalChange?.(itemsTotal(next));
  };
  const update = (i: number, patch: Partial<ItemRow>) =>
    commit(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const total = itemsTotal(rows);
  const json = JSON.stringify(
    rows
      .filter((r) => r.name.trim())
      .map((r) => ({
        name: r.name.trim(),
        spec: r.spec.trim(),
        quantity: Math.trunc(Number(r.quantity) || 0),
        unitPrice: Math.trunc(Number(digitsOf(r.unitPrice)) || 0),
      })),
  );

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <input type="hidden" name="items" value={json} />
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-slate-700">
          구매 품목 <span className="text-xs font-normal text-slate-400">(품의서·검수확인서에 표기, 입력 시 공급가액 자동 합산)</span>
        </p>
        <button
          type="button"
          onClick={() => commit([...rows, emptyRow()])}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          + 품목 추가
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="px-1 py-1 font-medium">품목명</th>
              <th className="px-1 py-1 font-medium">규격</th>
              <th className="w-20 px-1 py-1 font-medium">수량</th>
              <th className="w-32 px-1 py-1 font-medium">단가(원)</th>
              <th className="w-32 px-1 py-1 text-right font-medium">금액(원)</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const amount =
                Math.trunc(Number(r.quantity) || 0) * Math.trunc(Number(digitsOf(r.unitPrice)) || 0);
              return (
                <tr key={i}>
                  <td className="px-1 py-1">
                    <input value={r.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="예: BLE 개발보드" className={cell} />
                  </td>
                  <td className="px-1 py-1">
                    <input value={r.spec} onChange={(e) => update(i, { spec: e.target.value })} placeholder="규격/모델" className={cell} />
                  </td>
                  <td className="px-1 py-1">
                    <input type="number" min={1} step={1} value={r.quantity} onChange={(e) => update(i, { quantity: e.target.value })} className={cell} />
                  </td>
                  <td className="px-1 py-1">
                    <input inputMode="numeric" value={fmt(digitsOf(r.unitPrice))} onChange={(e) => update(i, { unitPrice: digitsOf(e.target.value) })} placeholder="0" className={cell} />
                  </td>
                  <td className="px-1 py-1 text-right font-medium text-slate-800">{amount.toLocaleString("ko-KR")}</td>
                  <td className="px-1 py-1 text-right">
                    <button type="button" onClick={() => commit(rows.filter((_, idx) => idx !== i))} className="text-xs text-slate-400 hover:text-red-600" aria-label="행 삭제">✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-right text-sm text-slate-700">
        품목 합계(공급가액) <span className="font-semibold">{total.toLocaleString("ko-KR")}원</span>
      </p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
