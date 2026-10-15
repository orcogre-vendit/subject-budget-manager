"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/app/projects/actions";
import EvidenceDropInput from "@/components/EvidenceDropInput";
import type { NamingContext } from "@/lib/evidenceName";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * 거래 수정 화면의 증빙 추가 — 드롭존에 파일을 올리면 S3 로 바로 올라가고, 유형을 고른 뒤 [업로드]로 거래에 붙인다.
 * 성공하면 서버가 nonce 를 돌려주고, form 의 key 가 바뀌어 목록이 비워진다.
 */
export default function AttachmentUpload({
  action,
  hidden,
  suggestedCodes = [],
  naming,
}: {
  action: Action;
  hidden: Record<string, string | number>;
  suggestedCodes?: string[];
  naming?: NamingContext & { taken?: string[] };
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [busy, setBusy] = useState(false);

  return (
    <form key={state.nonce ?? 0} action={formAction}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <EvidenceDropInput
        suggestedCodes={suggestedCodes}
        error={state.fieldErrors?.file}
        title="증빙 추가"
        hint="(파일을 올린 뒤 유형을 고르고 업로드)"
        naming={naming}
        onBusyChange={setBusy}
      />
      {state.error && <p className="mt-1.5 text-xs text-red-600">{state.error}</p>}
      <div className="mt-2 flex justify-end">
        <button
          type="submit"
          disabled={pending || busy}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "저장 중…" : busy ? "파일 올리는 중…" : "첨부"}
        </button>
      </div>
    </form>
  );
}
