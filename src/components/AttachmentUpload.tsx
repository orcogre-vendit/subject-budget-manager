"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/projects/actions";
import { EVIDENCE_CODES } from "@/lib/evidence";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * 증빙 업로드 — 파일 + 증빙 유형(evidenceCode) 태깅.
 * suggestedCodes(세목 요건 코드)를 목록 상단에 먼저 보여준다.
 */
export default function AttachmentUpload({
  action,
  hidden,
  suggestedCodes = [],
}: {
  action: Action;
  hidden: Record<string, string | number>;
  suggestedCodes?: string[];
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const suggested = suggestedCodes.filter((c) => EVIDENCE_CODES[c]);
  const others = Object.keys(EVIDENCE_CODES).filter((c) => !suggested.includes(c));

  return (
    <form action={formAction} className="mt-3">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          name="evidenceCode"
          defaultValue={suggested[0] ?? ""}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 sm:w-56"
        >
          <option value="">증빙 유형 선택</option>
          {suggested.length > 0 && (
            <optgroup label="이 세목의 요건">
              {suggested.map((c) => (
                <option key={c} value={c}>{EVIDENCE_CODES[c]}</option>
              ))}
            </optgroup>
          )}
          <optgroup label={suggested.length ? "기타" : "증빙 유형"}>
            {others.map((c) => (
              <option key={c} value={c}>{EVIDENCE_CODES[c]}</option>
            ))}
          </optgroup>
        </select>
        <input
          type="file"
          name="file"
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-700"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          {pending ? "업로드 중…" : "업로드"}
        </button>
      </div>
      {state.fieldErrors?.file && <p className="mt-1.5 text-xs text-red-600">{state.fieldErrors.file}</p>}
      {state.error && <p className="mt-1.5 text-xs text-red-600">{state.error}</p>}
      <p className="mt-1.5 text-xs text-slate-400">
        PDF·이미지·오피스·HWP, 개당 20MB 이하, DRM·암호화 금지 (RCMS 업로드 요건)
      </p>
    </form>
  );
}
