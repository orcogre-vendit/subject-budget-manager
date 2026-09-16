"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/projects/actions";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/** RCMS "연구비 이체 실행 대상 목록" 엑셀 업로드 폼 */
export default function RcmsImportForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, {});
  const skipped = (state.values?.skipped ?? "").split("\n").filter(Boolean);

  return (
    <form action={formAction} className="mt-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="file"
          name="file"
          accept=".xlsx"
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-700"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          {pending ? "가져오는 중…" : "가져오기"}
        </button>
      </div>
      {state.fieldErrors?.file && <p className="mt-1.5 text-xs text-red-600">{state.fieldErrors.file}</p>}
      {state.error && <p className="mt-1.5 text-xs text-red-600">{state.error}</p>}
      {state.values?.summary && (
        <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{state.values.summary}</p>
      )}
      {skipped.length > 0 && (
        <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p className="font-semibold">건너뛴 행</p>
          <ul className="mt-1 list-disc pl-4">{skipped.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
      )}
    </form>
  );
}
