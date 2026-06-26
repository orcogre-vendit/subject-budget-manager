"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/projects/actions";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export default function AttachmentUpload({
  action,
  hidden,
}: {
  action: Action;
  hidden: Record<string, string | number>;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="mt-3">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="flex items-center gap-3">
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
      {state.fieldErrors?.file && (
        <p className="mt-1.5 text-xs text-red-600">{state.fieldErrors.file}</p>
      )}
      {state.error && (
        <p className="mt-1.5 text-xs text-red-600">{state.error}</p>
      )}
      <p className="mt-1.5 text-xs text-slate-400">
        영수증·계산서·사진·문서 (최대 20MB)
      </p>
    </form>
  );
}
