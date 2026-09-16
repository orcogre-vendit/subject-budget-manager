"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { FormState } from "@/app/projects/actions";
import MoneyInput from "@/components/MoneyInput";
import ItemsEditor, { itemsTotal, type ItemRow } from "@/components/ItemsEditor";
import { vatOf } from "@/lib/money";

/** 설치장소 기본값 — 서버(context.ts)와 동일 문자열. context.ts 는 fs 를 import 하므로 클라이언트에서 가져오지 않는다 */
const DEFAULT_INSTALL_LOCATION = "주식회사 벤디트 기업부설연구소내";

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
type Values = Record<string, string>;

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900";

function Label({ text, required, hint }: { text: string; required?: boolean; hint?: string }) {
  return (
    <label className="mb-1 block text-sm font-medium text-slate-700">
      {text}
      {required && <span className="ml-0.5 text-red-500">*</span>}
      {hint && <span className="ml-1 text-xs font-normal text-slate-400">{hint}</span>}
    </label>
  );
}
const Err = ({ msg }: { msg?: string }) => (msg ? <p className="mt-1 text-xs text-red-600">{msg}</p> : null);

/**
 * 비목(관리형 선택) + 세목·세세목(자유 입력 + 기존값 추천).
 * 새 값은 서버에서 해당 비목 아래로 자동 등록(find-or-create)된다.
 */
function CategorySelects({
  budgetTree,
  initial,
  error,
}: {
  budgetTree: BudgetTree;
  initial: Values;
  error?: string;
}) {
  const [itemId, setItemId] = useState(initial.budgetItemId ?? "");
  const [subName, setSubName] = useState(initial.budgetSubItemName ?? "");
  const [detailName, setDetailName] = useState(initial.budgetDetailItemName ?? "");

  const item = budgetTree.find((i) => String(i.id) === itemId);
  const subSuggestions = item ? item.subItems.map((s) => s.name) : [];
  const matchedSub = item?.subItems.find((s) => s.name === subName);
  const detailSuggestions = matchedSub ? matchedSub.detailItems.map((d) => d.name) : [];

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div>
        <Label text="비목" required />
        <select name="budgetItemId" value={itemId} onChange={(e) => setItemId(e.target.value)} className={inputCls}>
          <option value="">선택</option>
          {budgetTree.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
        <Err msg={error} />
      </div>
      <div>
        <Label text="세목" hint="(입력/추천)" />
        <input name="budgetSubItemName" list="sub-suggest" value={subName} disabled={!itemId} autoComplete="off"
          onChange={(e) => setSubName(e.target.value)} placeholder="예: 연구재료 구입비" className={inputCls + " disabled:bg-slate-100"} />
        <datalist id="sub-suggest">{subSuggestions.map((n) => <option key={n} value={n} />)}</datalist>
      </div>
      <div>
        <Label text="세세목" hint="(입력/추천)" />
        <input name="budgetDetailItemName" list="detail-suggest" value={detailName} disabled={!subName} autoComplete="off"
          onChange={(e) => setDetailName(e.target.value)} placeholder="예: 전문가활용비" className={inputCls + " disabled:bg-slate-100"} />
        <datalist id="detail-suggest">{detailSuggestions.map((n) => <option key={n} value={n} />)}</datalist>
      </div>
    </div>
  );
}

function parseInitialItems(json?: string): ItemRow[] {
  if (!json) return [];
  try {
    const arr: unknown = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return (arr as Record<string, unknown>[]).map((r) => ({
      name: String(r.name ?? ""),
      spec: String(r.spec ?? ""),
      quantity: String(r.quantity ?? "1"),
      unitPrice: String(r.unitPrice ?? ""),
    }));
  } catch {
    return [];
  }
}

/** 폼 본문 — 액션 결과마다 부모가 key 를 바꿔 리마운트하므로 상태가 항상 올바른 초기값에서 시작 */
function TxFields({ v, fe, budgetTree }: { v: Values; fe?: Record<string, string>; budgetTree: BudgetTree }) {
  const err = (k: string) => fe?.[k];
  const initialItems = parseInitialItems(v.items);

  const [direction, setDirection] = useState(v.direction ?? "");
  const [itemsTot, setItemsTot] = useState(() => itemsTotal(initialItems));
  const [manual, setManual] = useState(() => Number((v.amount ?? "").replace(/\D/g, "")) || 0);
  const [vatRate, setVatRate] = useState(v.vatRate ?? "10");

  const supply = itemsTot > 0 ? itemsTot : manual;
  const rate = Math.trunc(Number(vatRate) || 0);
  const autoVat = vatOf(supply, rate);
  const isIn = direction === "IN";

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <Label text="날짜" required />
          <input type="date" name="date" defaultValue={v.date ?? ""} className={inputCls} />
          <Err msg={err("date")} />
        </div>
        <div>
          <Label text="상태" />
          <select name="status" defaultValue={v.status ?? "신청"} className={inputCls}>
            <option value="신청">신청</option>
            <option value="완료">완료</option>
            <option value="취소">취소</option>
          </select>
        </div>
        <div>
          <Label text="구분" required />
          <select name="direction" value={direction} onChange={(e) => setDirection(e.target.value)} className={inputCls}>
            <option value="">선택</option>
            <option value="IN">입금</option>
            <option value="OUT">출금</option>
          </select>
          <Err msg={err("direction")} />
        </div>
        <div>
          <Label text={isIn ? "금액(원)" : "공급가액(원)"} required hint={itemsTot > 0 ? "품목 합계" : undefined} />
          <MoneyInput
            key={`amt-${itemsTot}`}
            name="amount"
            defaultValue={String(supply || "")}
            readOnly={itemsTot > 0}
            onValueChange={(d) => setManual(Number(d) || 0)}
          />
          <Err msg={err("amount")} />
        </div>
      </div>

      <CategorySelects budgetTree={budgetTree} initial={v} error={err("budgetItemId")} />

      {!isIn && (
        <>
          <ItemsEditor initial={initialItems} onTotalChange={setItemsTot} error={err("items")} />

          {/* 부가세 — 연구비 아님(회사 자금), 잔액 계산 제외 */}
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <Label text="부가세율(%)" />
              <input type="number" name="vatRate" min={0} max={100} step={1} value={vatRate}
                onChange={(e) => setVatRate(e.target.value)} className={inputCls} />
              <Err msg={err("vatRate")} />
            </div>
            <div>
              <Label text="부가세(원)" hint="자동계산·수정가능" />
              <MoneyInput key={`vat-${supply}-${rate}`} name="vatAmount" defaultValue={String(autoVat || "")} />
              <Err msg={err("vatAmount")} />
            </div>
            <div className="col-span-2 flex items-end pb-2 text-sm text-slate-600">
              총액 <span className="ml-1 font-semibold text-slate-900">{(supply + autoVat).toLocaleString("ko-KR")}원</span>
              <span className="ml-2 text-xs text-slate-400">(부가세는 회사 자금 · 연구비 잔액에서 제외)</span>
            </div>
          </div>

          {/* 거래처·결제 */}
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div><Label text="거래처" /><input name="vendor" defaultValue={v.vendor ?? ""} placeholder="예: (주)디바이스마트" className={inputCls} /></div>
            <div><Label text="은행명" /><input name="vendorBank" defaultValue={v.vendorBank ?? ""} className={inputCls} /></div>
            <div><Label text="계좌번호" /><input name="vendorAccount" defaultValue={v.vendorAccount ?? ""} className={inputCls} /></div>
            <div><Label text="예금주" /><input name="vendorHolder" defaultValue={v.vendorHolder ?? ""} className={inputCls} /></div>
            <div>
              <Label text="결제수단" />
              <select name="paymentMethod" defaultValue={v.paymentMethod ?? "RCMS 계좌이체"} className={inputCls}>
                <option value="RCMS 계좌이체">RCMS 계좌이체</option>
                <option value="연구비카드">연구비카드</option>
              </select>
            </div>
            <div><Label text="납품일" /><input type="date" name="deliveryDate" defaultValue={v.deliveryDate ?? ""} className={inputCls} /></div>
            <div><Label text="검수일" /><input type="date" name="inspectionDate" defaultValue={v.inspectionDate ?? ""} className={inputCls} /><Err msg={err("inspectionDate")} /></div>
            <div><Label text="지급기한" /><input type="date" name="paymentDueDate" defaultValue={v.paymentDueDate ?? ""} className={inputCls} /></div>
            <div className="col-span-2 sm:col-span-4">
              <Label text="설치(납품)장소" hint="(검수확인서에 표기)" />
              <input name="installLocation" defaultValue={v.installLocation ?? DEFAULT_INSTALL_LOCATION} className={inputCls} />
            </div>
          </div>

          <div className="mt-4">
            <Label text="구매 사유" hint="(과제와의 직접적 관련성 — 품의서·지출결의에 표기)" />
            <textarea name="purpose" rows={2} defaultValue={v.purpose ?? ""}
              placeholder="예: 스마트 마스크 PoC 보드 제작을 위한 개발보드 및 센서 구매" className={inputCls} />
          </div>
        </>
      )}

      <div className="mt-4">
        <Label text="적요" />
        <input type="text" name="description" defaultValue={v.description ?? ""}
          placeholder="예: 사무용품-오피스디포_토너외" className={inputCls} />
      </div>
    </>
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
  defaultValues?: Values;
  hidden?: Record<string, string | number>;
  cancelHref?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const v = state.values ?? defaultValues;

  return (
    <form action={formAction} className="mt-4">
      {Object.entries(hidden).map(([k, val]) => (
        <input key={k} type="hidden" name={k} value={val} />
      ))}
      {state.error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
      )}

      <TxFields key={JSON.stringify(v)} v={v} fe={state.fieldErrors} budgetTree={budgetTree} />

      <div className="mt-5 flex items-center gap-3">
        <button type="submit" disabled={pending}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
          {pending ? "저장 중…" : submitLabel}
        </button>
        {cancelHref && (
          <Link href={cancelHref} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">취소</Link>
        )}
      </div>
    </form>
  );
}
