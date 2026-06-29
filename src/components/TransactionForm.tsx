"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { FormState } from "@/app/projects/actions";
import MoneyInput from "@/components/MoneyInput";

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
 * 비목(관리형 선택) + 세목·세세목(자유 입력 + 기존값 추천).
 * 세목/세세목은 datalist로 기존 레코드를 추천하되 새 값도 입력 가능하며,
 * 서버에서 해당 비목 아래로 자동 등록(find-or-create)된다.
 * 액션 결과에 따라 부모가 key를 바꿔 리마운트하므로 effect 없이 초기화/복원된다.
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
  const [subName, setSubName] = useState(initial.budgetSubItemName ?? "");
  const [detailName, setDetailName] = useState(
    initial.budgetDetailItemName ?? "",
  );

  const item = budgetTree.find((i) => String(i.id) === itemId);
  const subSuggestions = item ? item.subItems.map((s) => s.name) : [];
  const matchedSub = item?.subItems.find((s) => s.name === subName);
  const detailSuggestions = matchedSub
    ? matchedSub.detailItems.map((d) => d.name)
    : [];

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          비목<span className="ml-0.5 text-red-500">*</span>
        </label>
        <select
          name="budgetItemId"
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
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
          세목 <span className="text-xs font-normal text-slate-400">(입력/추천)</span>
        </label>
        <input
          name="budgetSubItemName"
          list="sub-suggest"
          value={subName}
          disabled={!itemId}
          autoComplete="off"
          onChange={(e) => setSubName(e.target.value)}
          placeholder="예: 재료비"
          className={inputCls + " disabled:bg-slate-100"}
        />
        <datalist id="sub-suggest">
          {subSuggestions.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          세세목 <span className="text-xs font-normal text-slate-400">(입력/추천)</span>
        </label>
        <input
          name="budgetDetailItemName"
          list="detail-suggest"
          value={detailName}
          disabled={!subName}
          autoComplete="off"
          onChange={(e) => setDetailName(e.target.value)}
          placeholder="예: 프린트 토너"
          className={inputCls + " disabled:bg-slate-100"}
        />
        <datalist id="detail-suggest">
          {detailSuggestions.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
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
  const catKey = `${v.budgetItemId ?? ""}|${v.budgetSubItemName ?? ""}|${v.budgetDetailItemName ?? ""}`;

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
            <option value="취소">취소</option>
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
          <MoneyInput name="amount" defaultValue={v.amount ?? ""} />
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
