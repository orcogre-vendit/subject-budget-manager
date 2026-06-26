"use client";

import { useActionState } from "react";
import Link from "next/link";
import { RESEARCHER_FIELDS } from "@/app/researchers/fields";
import type { FormState } from "@/app/researchers/actions";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export default function ResearcherForm({
  action,
  defaultValues = {},
  researcherId,
  submitLabel,
}: {
  action: Action;
  defaultValues?: Record<string, string | null>;
  researcherId?: number;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  // React 19는 액션 완료 후 비제어 필드를 defaultValue로 리셋한다.
  // 검증 실패 시엔 서버가 돌려준 입력값을, 그 외엔 초기값을 사용.
  const values = state.values ?? defaultValues;

  return (
    <form action={formAction} className="mt-6 max-w-3xl">
      {researcherId != null && (
        <input type="hidden" name="id" value={researcherId} />
      )}

      {state.error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {RESEARCHER_FIELDS.map((f) => {
          const err = state.fieldErrors?.[f.key];
          return (
            <div
              key={f.key}
              className={f.full || f.type === "textarea" ? "sm:col-span-2" : ""}
            >
              <label
                htmlFor={f.key}
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                {f.label}
                {f.required && <span className="ml-0.5 text-red-500">*</span>}
                {f.sensitive && (
                  <span className="ml-1.5 text-xs font-normal text-amber-600">
                    민감정보
                  </span>
                )}
              </label>
              {f.type === "textarea" ? (
                <textarea
                  id={f.key}
                  name={f.key}
                  rows={2}
                  defaultValue={values[f.key] ?? ""}
                  placeholder={f.placeholder}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                />
              ) : (
                <input
                  id={f.key}
                  name={f.key}
                  type={f.type === "email" ? "email" : "text"}
                  defaultValue={values[f.key] ?? ""}
                  placeholder={f.placeholder}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                />
              )}
              {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "저장 중…" : submitLabel}
        </button>
        <Link
          href="/researchers"
          className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          취소
        </Link>
      </div>
    </form>
  );
}
