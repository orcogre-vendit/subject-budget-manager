"use client";

import { useActionState } from "react";
import { createBudgetItem } from "@/app/budget/actions";

export default function AddBudgetForm() {
  const [state, formAction, pending] = useActionState(createBudgetItem, {});

  return (
    <form action={formAction} className="flex items-start gap-2">
      <div>
        <input
          name="name"
          placeholder="새 비목명 (예: 간접비)"
          className="w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
        />
        {state.fieldErrors?.name && (
          <p className="mt-1 text-xs text-red-600">{state.fieldErrors.name}</p>
        )}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "추가 중…" : "+ 비목 추가"}
      </button>
    </form>
  );
}
