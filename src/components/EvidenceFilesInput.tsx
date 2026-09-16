"use client";

import { useState } from "react";
import { EVIDENCE_CODES } from "@/lib/evidence";

type Row = { id: number; code: string };

/** 거래 추가 시 기본으로 보여주는 증빙 줄 — 손에 든 채로 입력하는 경우가 많은 세 가지 */
const DEFAULT_CODES = ["STATEMENT", "TAX_INVOICE", "CARD_SLIP"];

/**
 * 거래 추가 폼 안의 증빙 첨부 줄들. 각 줄 = 증빙 유형(evidenceCode) + 파일(evidenceFile).
 * 두 필드는 같은 순서로 FormData 에 들어가므로 서버에서 인덱스로 짝을 맞춘다. 파일 없는 줄은 무시.
 */
export default function EvidenceFilesInput({
  suggestedCodes = [],
  error,
}: {
  suggestedCodes?: string[];
  error?: string;
}) {
  const [rows, setRows] = useState<Row[]>(DEFAULT_CODES.map((code, i) => ({ id: i, code })));
  const [nextId, setNextId] = useState(DEFAULT_CODES.length);

  const suggested = suggestedCodes.filter((c) => EVIDENCE_CODES[c]);
  const others = Object.keys(EVIDENCE_CODES).filter((c) => !suggested.includes(c));
  const setCode = (id: number, code: string) => setRows(rows.map((r) => (r.id === id ? { ...r, code } : r)));

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-slate-700">
          증빙 첨부 <span className="text-xs font-normal text-slate-400">(선택 · 저장할 때 함께 업로드, 나중에 수정 화면에서도 추가 가능)</span>
        </p>
        <button
          type="button"
          onClick={() => { setRows([...rows, { id: nextId, code: "" }]); setNextId(nextId + 1); }}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          + 첨부 추가
        </button>
      </div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.id} className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
            <select
              name="evidenceCode"
              value={r.code}
              onChange={(e) => setCode(r.id, e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-slate-900 sm:w-52"
            >
              <option value="">증빙 유형</option>
              {suggested.length > 0 && (
                <optgroup label="이 세목의 요건">
                  {suggested.map((c) => <option key={c} value={c}>{EVIDENCE_CODES[c]}</option>)}
                </optgroup>
              )}
              <optgroup label={suggested.length ? "기타" : "증빙 유형"}>
                {others.map((c) => <option key={c} value={c}>{EVIDENCE_CODES[c]}</option>)}
              </optgroup>
            </select>
            <input
              type="file"
              name="evidenceFile"
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700 file:ring-1 file:ring-slate-300 hover:file:bg-slate-100"
            />
            <button
              type="button"
              onClick={() => setRows(rows.filter((x) => x.id !== r.id))}
              className="self-end text-xs text-slate-400 hover:text-red-600 sm:self-auto"
              aria-label="줄 삭제"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      <p className="mt-2 text-xs text-slate-400">PDF·이미지·오피스·HWP, 개당 20MB 이하, DRM·암호화 금지 (RCMS 업로드 요건). 파일을 고르지 않은 줄은 무시됩니다.</p>
    </div>
  );
}
