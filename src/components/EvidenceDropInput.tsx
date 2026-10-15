"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { EVIDENCE_CODES } from "@/lib/evidence";
import { ALLOWED_EXT, MAX_UPLOAD_BYTES, extOf, normalizeFileName } from "@/lib/uploadRules";
import { pickEvidenceFileName, type NamingContext } from "@/lib/evidenceName";
import { uploadToStaging } from "@/lib/upload-client";

export type UploadStatus = "uploading" | "done" | "error";

/**
 * name 은 정규화된 표시용 파일명(서버도 같은 규칙으로 저장). file 은 원본 File.
 * 파일은 고르는 즉시 S3 staging/ 에 올라가고(key), 폼은 key 만 서버로 보낸다.
 */
export type PickedEvidence = {
  id: number;
  file: File;
  name: string;
  code: string;
  problem: string | null;
  status: UploadStatus;
  key: string | null;
  error: string | null;
};

/** 파일명으로 증빙 유형 추측 — 순서대로 첫 매치. 못 맞히면 빈 값(사용자가 고름) */
const NAME_RULES: [RegExp, string][] = [
  [/통장.?사본|bank.?(copy|book)|passbook/i, "BANK_COPY"],
  [/사업자.?등록|business.?reg/i, "BIZ_REG"],
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

/** 제출될(규칙 통과 + 업로드 완료 + 유형 선택된) 증빙 코드 목록 — 부모의 요건 체크에 쓴다 */
const codesOf = (list: PickedEvidence[]) => list.filter((p) => !p.problem && p.status === "done" && p.code).map((p) => p.code);
const busyOf = (list: PickedEvidence[]) => list.some((p) => !p.problem && p.status === "uploading");

const human = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

/**
 * 증빙 드롭존 — 파일을 먼저 올리고(드래그앤드롭 또는 클릭), 올라온 파일마다 유형을 고른다.
 * 파일은 고르는 즉시 S3 staging/ 으로 직접 올라가고(presigned PUT), 폼에는 파일 대신
 * evidenceKey / evidenceName / evidenceType / evidenceSize / evidenceCode 묶음이 같은 순서로 실린다.
 * 업로드 중인 파일이 있으면 evidencePending=1 이 실려 서버가 저장을 거부한다.
 */
export default function EvidenceDropInput({
  suggestedCodes = [],
  error,
  title = "증빙 첨부",
  hint,
  onCodesChange,
  onSelectionChange,
  onBusyChange,
  naming,
}: {
  suggestedCodes?: string[];
  error?: string;
  title?: string;
  hint?: string;
  /** 제출될 증빙 코드가 바뀔 때마다 알림 (요건 충족 표시용) */
  onCodesChange?: (codes: string[]) => void;
  /** AI 분석 등에서 현재 선택 파일을 사용할 때 호출된다 (업로드 상태 포함) */
  onSelectionChange?: (picked: PickedEvidence[]) => void;
  /** 업로드 진행 중 여부 — 부모가 제출 버튼을 잠근다 */
  onBusyChange?: (busy: boolean) => void;
  /** 저장 시 붙을 파일명 미리보기 문맥. taken 은 이미 있는 첨부 이름(중복 번호 계산용) */
  naming?: NamingContext & { taken?: string[] };
}) {
  const [picked, setPicked] = useState<PickedEvidence[]>([]);
  const [over, setOver] = useState(false);
  const seq = useRef(0);
  const browseRef = useRef<HTMLInputElement>(null);

  // 부모 콜백은 ref 로 들고 있다가 목록이 바뀐 뒤(effect)에 알린다 — 렌더 중 부모 상태를 건드리지 않는다
  const callbacks = useRef({ onCodesChange, onSelectionChange, onBusyChange });
  useEffect(() => {
    callbacks.current = { onCodesChange, onSelectionChange, onBusyChange };
  });
  useEffect(() => {
    const c = callbacks.current;
    c.onCodesChange?.(codesOf(picked));
    c.onSelectionChange?.(picked);
    c.onBusyChange?.(busyOf(picked));
  }, [picked]);
  // 언마운트(폼 리셋) 시 부모의 busy 를 풀어준다
  useEffect(() => () => callbacks.current.onBusyChange?.(false), []);

  const suggested = suggestedCodes.filter((c) => EVIDENCE_CODES[c]);
  const others = Object.keys(EVIDENCE_CODES).filter((c) => !suggested.includes(c));

  /** 비동기 업로드 결과를 최신 목록에 반영 (그 사이 다른 파일이 추가·삭제됐어도 안전) */
  const patch = (id: number, p: Partial<PickedEvidence>) =>
    setPicked((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const upload = async (row: PickedEvidence) => {
    try {
      const staged = await uploadToStaging(row.file);
      patch(row.id, { status: "done", key: staged.key, error: null });
    } catch (e) {
      patch(row.id, { status: "error", key: null, error: e instanceof Error ? e.message : "업로드 실패" });
    }
  };

  const add = (files: FileList | File[]) => {
    const next: PickedEvidence[] = [...files]
      .filter((f) => f.size > 0)
      .map((f) => {
        const name = normalizeFileName(f.name);
        const problem = problemOf(name, f.size);
        return {
          id: seq.current++,
          file: f,
          name,
          code: guessEvidenceCode(name),
          problem,
          status: problem ? "error" : "uploading",
          key: null,
          error: null,
        } satisfies PickedEvidence;
      });
    if (!next.length) return;
    setPicked((prev) => [...prev, ...next]);
    for (const row of next) if (!row.problem) void upload(row);
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
  const setCode = (id: number, code: string) => patch(id, { code });
  const remove = (id: number) => setPicked((prev) => prev.filter((x) => x.id !== id));
  const retry = (id: number) => {
    const row = picked.find((x) => x.id === id);
    if (!row || row.problem) return;
    patch(id, { status: "uploading", error: null, key: null });
    void upload({ ...row, status: "uploading" });
  };
  const openBrowse = () => browseRef.current?.click();

  // 서버와 같은 규칙으로 저장 이름을 미리 계산 (같은 종류가 여럿이면 -2, -3 …)
  const previews = new Map<number, string>();
  if (naming) {
    const taken = new Set(naming.taken ?? []);
    for (const p of picked) if (!p.problem) previews.set(p.id, pickEvidenceFileName(naming, p.code || null, p.name, taken));
  }
  const pending = busyOf(picked);

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
      {pending && <input type="hidden" name="evidencePending" value="1" />}

      {picked.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {picked.map((p) => (
            <li key={p.id} className="flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-slate-800">{p.name}</p>
                <p className="text-xs text-slate-400">
                  {human(p.file.size)}
                  {p.problem && <span className="ml-2 font-medium text-red-600">{p.problem} · 업로드에서 제외</span>}
                  {!p.problem && p.status === "uploading" && <span className="ml-2 text-blue-600">업로드 중…</span>}
                  {!p.problem && p.status === "error" && (
                    <span className="ml-2 font-medium text-red-600">
                      {p.error ?? "업로드 실패"}{" "}
                      <button type="button" onClick={() => retry(p.id)} className="underline">다시 시도</button>
                    </span>
                  )}
                  {previews.has(p.id) && (
                    <span className="ml-2 text-slate-500">
                      저장 이름 <b className="font-medium text-slate-700">{previews.get(p.id)}</b>
                    </span>
                  )}
                </p>
              </div>
              {!p.problem && (
                <select
                  name={p.status === "done" ? "evidenceCode" : undefined}
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
              )}
              {!p.problem && p.status === "done" && p.key && (
                <>
                  <input type="hidden" name="evidenceKey" value={p.key} />
                  <input type="hidden" name="evidenceName" value={p.name} />
                  <input type="hidden" name="evidenceType" value={p.file.type || "application/octet-stream"} />
                  <input type="hidden" name="evidenceSize" value={p.file.size} />
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
