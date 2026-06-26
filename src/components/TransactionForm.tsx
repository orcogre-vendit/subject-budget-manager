"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { FormState } from "@/app/projects/actions";

export type BudgetTree = {
  id: number;
  name: string;
  subItems: {
    id: number;
    name: string;
    detailItems: { id: number; name: string }[];
  }[];
}[];

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900";

/**
 * 비목→세목→세세목 연쇄 셀렉트. 내부 useState로 연동하되,
 * 액션 결과(성공:초기화 / 실패:입력복원)에 따라 부모가 key를 바꿔 리마운트시키므로
 * effect 없이 항상 올바른 초기값에서 시작한다.
 */
function CategorySelects({
  budgetTree,
  initial,
  error,
}: {
  budgetTree: BudgetTree;
  initial: Record<string, string>;
  error?: string;
}) {
  const [itemId, setItemId] = useState(initial.budgetItemId ?? "");
  const [subId, setSubId] = useState(initial.budgetSubItemId ?? "");
  const [detailId, setDetailId] = useState(initial.budgetDetailItemId ?? "");

  const subOptions =
    budgetTree.find((i) => String(i.id) === itemId)?.subItems ?? [];
  const detailOptions =
    subOptions.find((s) => String(s.id) === subId)?.detailItems ?? [];

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          비목<span className="ml-0.5 text-red-500">*</span>
        </label>
        <select
          name="budgetItemId"
          value={itemId}
          onChange={(e) => {
            setItemId(e.target.value);
            setSubId("");
            setDetailId("");
          }}
          className={inputCls}
        >
          <option value="">선택</option>
          {budgetTree.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          세목
        </label>
        <select
          name="budgetSubItemId"
          value={subId}
          disabled={!itemId}
          onChange={(e) => {
            setSubId(e.target.value);
            setDetailId("");
          }}
          className={inputCls + " disabled:bg-slate-100"}
        >
          <option value="">선택</option>
          {subOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          세세목
        </label>
        <select
          name="budgetDetailItemId"
          value={detailId}
          disabled={!subId || detailOptions.length === 0}
          onChange={(e) => setDetailId(e.target.value)}
          className={inputCls + " disabled:bg-slate-100"}
        >
          <option value="">선택</option>
          {detailOptions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default function TransactionForm({
  budgetTree,
  action,
  submitLabel,
  defaultValues = {},
  hidden = {},
  cancelHref,
}: {
  budgetTree: BudgetTree;
  action: Action;
  submitLabel: string;
  defaultValues?: Record<string, string>;
  hidden?: Record<string, string | number>;
  cancelHref?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const v = state.values ?? defaultValues;
  const err = (k: string) => state.fieldErrors?.[k];

  // 액션 결과가 바뀔 때마다 연쇄 셀렉트를 새 초기값으로 리마운트
  const catKey = `${v.budgetItemId ?? ""}|${v.budgetSubItemId ?? ""}|${v.budgetDetailItemId ?? ""}`;

  return (
    <form action={formAction} className="mt-4">
      {Object.entries(hidden).map(([k, val]) => (
        <input key={k} type="hidden" name={k} value={val} />
      ))}

      {state.error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* 날짜 */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            날짜<span className="ml-0.5 text-red-500">*</span>
          </label>
          <input
            type="date"
            name="date"
            defaultValue={v.date ?? ""}
            className={inputCls}
          />
          {err("date") && (
            <p className="mt-1 text-xs text-red-600">{err("date")}</p>
          )}
        </div>

        {/* 상태 */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            상태
          </label>
          <select
            name="status"
            defaultValue={v.status ?? "신청"}
            className={inputCls}
          >
            <option value="신청">신청</option>
            <option value="완료">완료</option>
          </select>
        </div>

        {/* 입/출 */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            구분<span className="ml-0.5 text-red-500">*</span>
          </label>
          <select
            name="direction"
            defaultValue={v.direction ?? ""}
            className={inputCls}
          >
            <option value="">선택</option>
            <option value="IN">입금</option>
            <option value="OUT">출금</option>
          </select>
          {err("direction") && (
            <p className="mt-1 text-xs text-red-600">{err("direction")}</p>
          )}
        </div>

        {/* 금액 */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            금액(원)<span className="ml-0.5 text-red-500">*</span>
          </label>
          <input
            type="number"
            name="amount"
            min="0"
            step="1"
            defaultValue={v.amount ?? ""}
            className={inputCls}
          />
          {err("amount") && (
            <p className="mt-1 text-xs text-red-600">{err("amount")}</p>
          )}
        </div>
      </div>

      {/* 비목 → 세목 → 세세목 */}
      <CategorySelects
        key={catKey}
        budgetTree={budgetTree}
        initial={v}
        error={err("budgetItemId")}
      />

      {/* 적요 */}
      <div className="mt-4">
        <label className="mb-1 block text-sm font-medium text-slate-700">
          적요
        </label>
        <input
          type="text"
          name="description"
          defaultValue={v.description ?? ""}
          placeholder="예: 사무용품-오피스디포_토너외"
          className={inputCls}
        />
      </div>

      <div className="mt-5 flex items-center gap-3">
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
