"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { ProjectField } from "@/app/projects/fields";
import type { FormState } from "@/app/projects/actions";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900";

function Field({
  f,
  values,
  err,
}: {
  f: ProjectField;
  values: Record<string, string>;
  err?: string;
}) {
  const v = values[f.key] ?? "";
  return (
    <div className={f.full ? "sm:col-span-2" : ""}>
      <label
        htmlFor={f.key}
        className="mb-1 block text-sm font-medium text-slate-700"
      >
        {f.label}
        {f.required && <span className="ml-0.5 text-red-500">*</span>}
      </label>

      {f.type === "checkbox" ? (
        <label className="flex items-center gap-2 py-1.5 text-sm text-slate-700">
          <input
            id={f.key}
            name={f.key}
            type="checkbox"
            defaultChecked={v === "on"}
            className="h-4 w-4 rounded border-slate-300"
          />
          사용 중
        </label>
      ) : f.type === "select" ? (
        <select
          id={f.key}
          name={f.key}
          defaultValue={v}
          className={inputCls}
        >
          <option value="">(미지정)</option>
          {f.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <div className="relative">
          <input
            id={f.key}
            name={f.key}
            type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
            step={f.type === "number" ? "any" : undefined}
            defaultValue={v}
            placeholder={f.placeholder}
            className={inputCls + (f.suffix ? " pr-10" : "")}
          />
          {f.suffix && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
              {f.suffix}
            </span>
          )}
        </div>
      )}

      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}

export default function RecordForm({
  fields,
  action,
  submitLabel,
  defaultValues = {},
  hidden = {},
  cancelHref,
  advancedLabel = "상세정보",
}: {
  fields: ProjectField[];
  action: Action;
  submitLabel: string;
  defaultValues?: Record<string, string>;
  hidden?: Record<string, string | number>;
  cancelHref?: string;
  advancedLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? defaultValues;

  const core = fields.filter((f) => !f.advanced);
  const advanced = fields.filter((f) => f.advanced);

  return (
    <form action={formAction} className="mt-6 max-w-3xl">
      {Object.entries(hidden).map(([k, val]) => (
        <input key={k} type="hidden" name={k} value={val} />
      ))}

      {state.error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {core.map((f) => (
          <Field
            key={f.key}
            f={f}
            values={values}
            err={state.fieldErrors?.[f.key]}
          />
        ))}
      </div>

      {advanced.length > 0 && (
        <details className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            {advancedLabel}
          </summary>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {advanced.map((f) => (
              <Field
                key={f.key}
                f={f}
                values={values}
                err={state.fieldErrors?.[f.key]}
              />
            ))}
          </div>
        </details>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "저장 중…" : submitLabel}
        </button>
        {cancelHref && (
          <Link
            href={cancelHref}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            취소
          </Link>
        )}
      </div>
    </form>
  );
}
