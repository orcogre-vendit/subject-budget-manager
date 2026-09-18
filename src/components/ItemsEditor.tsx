"use client";

import { useState } from "react";

import { lineAmount, normalizeUnitPrice } from "@/lib/money";

export type ItemRow = { name: string; spec: string; quantity: string; unitPrice: string };
type Row = ItemRow & { id: number };

/** 행 key 용 일련번호 — 비제어 input 이 행 삭제 후에도 제 값을 유지하려면 index 가 아닌 고정 id 가 필요 */
let rowSeq = 1;
const mk = (r: ItemRow): Row => ({ ...r, id: rowSeq++ });

/** 입력 중인 단가 정리 — 숫자와 소수점 하나만, 소수 2자리까지. 끝의 "." 은 타이핑 중이므로 남긴다 */
const cleanPrice = (s: string) => {
  const t = s.replace(/[^\d.]/g, "");
  const dot = t.indexOf(".");
  if (dot < 0) return t;
  return `${t.slice(0, dot)}.${t.slice(dot + 1).replace(/\./g, "").slice(0, 2)}`;
};
/** 표시용 — 정수부에 콤마, 소수부는 입력한 그대로 (예 "33333.3" → "33,333.3", "12." → "12.") */
const showPrice = (clean: string) => {
  if (!clean) return "";
  const dot = clean.indexOf(".");
  const int = (dot < 0 ? clean : clean.slice(0, dot)).replace(/^0+(?=\d)/, "") || "0";
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return dot < 0 ? grouped : `${grouped}.${clean.slice(dot + 1)}`;
};
const cell =
  "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-900";

export const emptyRow = (): ItemRow => ({ name: "", spec: "", quantity: "1", unitPrice: "" });

/** 초기 rows 로부터 정수 합계(원) — 행마다 수량×단가를 원 단위로 반올림한 뒤 더한다 */
export function itemsTotal(rows: ItemRow[]): number {
  return rows.reduce((s, r) => {
    if (!r.name.trim()) return s;
    return s + lineAmount(Number(r.quantity) || 0, r.unitPrice);
  }, 0);
}

/**
 * 거래 품목 편집기 — 품목명/규격/수량/단가 다건 입력. 단가는 소수 2자리까지(예: 33,333.33).
 * hidden input `items` 에 JSON 으로 직렬화하고, 합계가 바뀌면 onTotalChange 로 알린다.
 * 텍스트 입력은 비제어(defaultValue)로 둔다: 제어 입력은 한글 IME 조합 중 부모 리렌더와 겹치면 글자가 중복 입력될 수 있다.
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
  const [rows, setRows] = useState<Row[]>(() => (initial.length ? initial : [emptyRow()]).map(mk));

  const commit = (next: Row[]) => {
    setRows(next);
    onTotalChange?.(itemsTotal(next));
  };
  const update = (id: number, patch: Partial<ItemRow>) =>
    commit(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const total = itemsTotal(rows);
  const json = JSON.stringify(
    rows
      .filter((r) => r.name.trim())
      .map((r) => ({
        name: r.name.trim(),
        spec: r.spec.trim(),
        quantity: Math.trunc(Number(r.quantity) || 0),
        unitPrice: normalizeUnitPrice(r.unitPrice) ?? "0",
      })),
  );

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <input type="hidden" name="items" value={json} />
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-slate-700">
          구매 품목 <span className="text-xs font-normal text-slate-400">(품의서·검수확인서에 표기, 입력 시 공급가액 자동 합산 · 단가는 소수점 2자리까지)</span>
        </p>
        <button
          type="button"
          onClick={() => commit([...rows, mk(emptyRow())])}
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
            {rows.map((r) => {
              const amount = lineAmount(Number(r.quantity) || 0, r.unitPrice);
              return (
                <tr key={r.id}>
                  <td className="px-1 py-1">
                    <input defaultValue={r.name} onChange={(e) => update(r.id, { name: e.target.value })} placeholder="예: BLE 개발보드" className={cell} />
                  </td>
                  <td className="px-1 py-1">
                    <input defaultValue={r.spec} onChange={(e) => update(r.id, { spec: e.target.value })} placeholder="규격/모델" className={cell} />
                  </td>
                  <td className="px-1 py-1">
                    <input type="number" min={1} step={1} defaultValue={r.quantity} onChange={(e) => update(r.id, { quantity: e.target.value })} className={cell} />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      inputMode="decimal"
                      defaultValue={showPrice(cleanPrice(r.unitPrice))}
                      onInput={(e) => {
                        const c = cleanPrice(e.currentTarget.value);
                        e.currentTarget.value = showPrice(c);
                        update(r.id, { unitPrice: c });
                      }}
                      placeholder="0"
                      className={cell}
                    />
                  </td>
                  <td className="px-1 py-1 text-right font-medium text-slate-800">{amount.toLocaleString("ko-KR")}</td>
                  <td className="px-1 py-1 text-right">
                    <button type="button" onClick={() => commit(rows.filter((x) => x.id !== r.id))} className="text-xs text-slate-400 hover:text-red-600" aria-label="행 삭제">✕</button>
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
