"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { EVIDENCE_CODES } from "@/lib/evidence";
import { ALLOWED_EXT, MAX_UPLOAD_BYTES, extOf, normalizeFileName } from "@/lib/uploadRules";
import { pickEvidenceFileName, type NamingContext } from "@/lib/evidenceName";

/** name 은 정규화된 표시용 파일명(서버도 같은 규칙으로 저장). file 은 원본 File */
export type PickedEvidence = { id: number; file: File; name: string; code: string; problem: string | null };

/** 파일명으로 증빙 유형 추측 — 순서대로 첫 매치. 못 맞히면 빈 값(사용자가 고름) */
const NAME_RULES: [RegExp, string][] = [
  [/세금계산서|계산서|tax.?invoice/i, "TAX_INVOICE"],
  [/거래명세|명세서|statement/i, "STATEMENT"],
  [/카드|매출전표|card|slip/i, "CARD_SLIP"],
  [/영수증|receipt/i, "RECEIPT"],
  [/견적|quot/i, "QUOTE"],
  [/발주/i, "PURCHASE_ORDER"],
  [/시험.*의뢰|분석.*의뢰/i, "SERVICE_REQUEST"],
  [/품의|구매의뢰|purchase/i, "PURCHASE_REQUEST"],
  [/수료증/i, "TRAINING_CERT"],
  [/기여도/i, "CONTRIB_EVAL"],
  [/지급신청/i, "PAY_REQUEST"],
  [/장비등록증/i, "EQUIP_REGISTRY"],
  [/검수.*확인|설치.*확인|inspection/i, "INSPECTION_CERT"],
  [/계약|contract/i, "CONTRACT"],
  [/회의록|minutes/i, "MEETING_MINUTES"],
  [/출장.*(결과|보고)/i, "TRAVEL_REPORT"],
  [/출장/i, "TRAVEL_REQUEST"],
  [/급여|payslip/i, "PAYSLIP"],
  [/이체.*(확인|증명)|transfer/i, "TRANSFER_PROOF"],
  [/지출결의|지결|flex|결재/i, "INTERNAL_APPROVAL"], // flex 에서 내려받은 결재 문서
];
const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "gif", "bmp", "tif", "tiff"]);

export function guessEvidenceCode(fileName: string): string {
  for (const [re, code] of NAME_RULES) if (re.test(fileName)) return code;
  if (IMAGE_EXT.has(extOf(fileName))) return "INSPECTION_PHOTO"; // 사진은 대개 납품·설치 사진
  return "";
}

function problemOf(name: string, size: number): string | null {
  if (!ALLOWED_EXT.has(extOf(name))) return "허용되지 않는 형식";
  if (size > MAX_UPLOAD_BYTES) return "20MB 초과";
  return null;
}

/** 제출될(규칙 통과 + 유형 선택된) 증빙 코드 목록 — 부모의 요건 체크에 쓴다 */
const codesOf = (list: PickedEvidence[]) => list.filter((p) => !p.problem && p.code).map((p) => p.code);

const human = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

/**
 * 증빙 드롭존 — 파일을 먼저 올리고(드래그앤드롭 또는 클릭), 올라온 파일마다 유형을 고른다.
 * 제출은 파일당 숨은 <input type=file name=evidenceFile> + <select name=evidenceCode> 쌍으로 나가므로
 * 서버는 evidenceFile[i] ↔ evidenceCode[i] 로 짝을 맞춘다. 규칙 위반 파일은 제출에서 제외한다.
 */
export default function EvidenceDropInput({
  suggestedCodes = [],
  error,
  title = "증빙 첨부",
  hint,
  onCodesChange,
  onSelectionChange,
  naming,
}: {
  suggestedCodes?: string[];
  error?: string;
  title?: string;
  hint?: string;
  /** 제출될 증빙 코드가 바뀔 때마다 알림 (요건 충족 표시용) */
  onCodesChange?: (codes: string[]) => void;
  /** AI 분석 등에서 현재 선택 파일을 사용할 때 호출된다. 파일은 아직 서버에 저장되지 않은 상태다. */
  onSelectionChange?: (picked: PickedEvidence[]) => void;
  /** 저장 시 붙을 파일명 미리보기 문맥. taken 은 이미 있는 첨부 이름(중복 번호 계산용) */
  naming?: NamingContext & { taken?: string[] };
}) {
  const [picked, setPicked] = useState<PickedEvidence[]>([]);
  const [over, setOver] = useState(false);
  const seq = useRef(0);
  const browseRef = useRef<HTMLInputElement>(null);

  const suggested = suggestedCodes.filter((c) => EVIDENCE_CODES[c]);
  const others = Object.keys(EVIDENCE_CODES).filter((c) => !suggested.includes(c));

  const commit = (next: PickedEvidence[]) => {
    setPicked(next);
    onCodesChange?.(codesOf(next));
    onSelectionChange?.(next);
  };
  const add = (files: FileList | File[]) => {
    const next: PickedEvidence[] = [...files]
      .filter((f) => f.size > 0)
      .map((f) => {
        const name = normalizeFileName(f.name);
        return { id: seq.current++, file: f, name, code: guessEvidenceCode(name), problem: problemOf(name, f.size) };
      });
    if (next.length) commit([...picked, ...next]);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    add(e.dataTransfer.files);
  };
  const onBrowse = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) add(e.target.files);
    e.target.value = ""; // 같은 파일을 다시 골라도 change 가 나도록
  };
  const setCode = (id: number, code: string) => commit(picked.map((x) => (x.id === id ? { ...x, code } : x)));
  const remove = (id: number) => commit(picked.filter((x) => x.id !== id));
  /** 숨은 file input 에 File 을 심는다 (DataTransfer 로 programmatic 설정). 폼 리셋 뒤에도 매 렌더마다 다시 심는다 */
  const plant = (file: File) => (el: HTMLInputElement | null) => {
    if (!el) return;
    if (el.files?.length === 1 && el.files[0] === file) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    el.files = dt.files;
  };
  const openBrowse = () => browseRef.current?.click();

  // 서버와 같은 규칙으로 저장 이름을 미리 계산 (같은 종류가 여럿이면 -2, -3 …)
  const previews = new Map<number, string>();
  if (naming) {
    const taken = new Set(naming.taken ?? []);
    for (const p of picked) if (!p.problem) previews.set(p.id, pickEvidenceFileName(naming, p.code || null, p.name, taken));
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-medium text-slate-700">
        {title}
        {hint && <span className="ml-1 text-xs font-normal text-slate-400">{hint}</span>}
      </p>

      <div
        role="button"
        tabIndex={0}
        onClick={openBrowse}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openBrowse(); } }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`mt-2 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition-colors ${
          over ? "border-slate-900 bg-slate-100" : "border-slate-300 bg-white hover:bg-slate-100"
        }`}
      >
        <span className="text-2xl" aria-hidden>📎</span>
        <span className="mt-1 text-slate-700">파일을 여기에 끌어다 놓거나 클릭해서 선택</span>
        <span className="mt-0.5 text-xs text-slate-400">여러 개 가능 · PDF·이미지·오피스·HWP · 개당 20MB · DRM·암호화 금지</span>
      </div>
      {/* name 없음 → 제출되지 않는 탐색용 input */}
      <input ref={browseRef} type="file" multiple onChange={onBrowse} className="hidden" tabIndex={-1} aria-hidden />

      {picked.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {picked.map((p) => (
            <li key={p.id} className="flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-slate-800">{p.name}</p>
                <p className="text-xs text-slate-400">
                  {human(p.file.size)}
                  {p.problem && <span className="ml-2 font-medium text-red-600">{p.problem} · 업로드에서 제외</span>}
                  {previews.has(p.id) && (
                    <span className="ml-2 text-slate-500">
                      저장 이름 <b className="font-medium text-slate-700">{previews.get(p.id)}</b>
                    </span>
                  )}
                </p>
              </div>
              {!p.problem && (
                <>
                  <select
                    name="evidenceCode"
                    value={p.code}
                    onChange={(e) => setCode(p.id, e.target.value)}
                    className={`rounded-md border px-2 py-1.5 text-sm outline-none focus:border-slate-900 sm:w-56 ${
                      p.code ? "border-slate-300 bg-white" : "border-amber-400 bg-amber-50"
                    }`}
                  >
                    <option value="">유형 선택…</option>
                    {suggested.length > 0 && (
                      <optgroup label="이 세목의 요건">
                        {suggested.map((c) => <option key={c} value={c}>{EVIDENCE_CODES[c]}</option>)}
                      </optgroup>
                    )}
                    <optgroup label={suggested.length ? "기타" : "증빙 유형"}>
                      {others.map((c) => <option key={c} value={c}>{EVIDENCE_CODES[c]}</option>)}
                    </optgroup>
                  </select>
                  <input type="file" name="evidenceFile" ref={plant(p.file)} className="hidden" tabIndex={-1} aria-hidden />
                </>
              )}
              <button
                type="button"
                onClick={() => remove(p.id)}
                className="self-end text-xs text-slate-400 hover:text-red-600 sm:self-auto"
                aria-label={`${p.name} 제거`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
