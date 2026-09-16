"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { FormState } from "@/app/projects/actions";
import type { ReqRow } from "@/lib/evidence";
import MoneyInput from "@/components/MoneyInput";
import ItemsEditor, { itemsTotal, type ItemRow } from "@/components/ItemsEditor";
import EvidenceDropInput from "@/components/EvidenceDropInput";
import EvidenceReqPanel from "@/components/EvidenceReqPanel";
import { vatOf, splitTotal } from "@/lib/money";

/** 설치장소 기본값 — 서버(context.ts)와 동일 문자열. context.ts 는 fs 를 import 하므로 클라이언트에서 가져오지 않는다 */
const DEFAULT_INSTALL_LOCATION = "주식회사 벤디트 기업부설연구소내";

export type BudgetSub = {
  id: number;
  name: string;
  detailItems: { id: number; name: string }[];
  evidenceRequirements?: ReqRow[];
};

export type BudgetTree = {
  id: number;
  name: string;
  subItems: BudgetSub[];
}[];

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;
type Values = Record<string, string>;

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900";

/** 부가세율 선택지 — 국내 과세 10%, 면세·영세·해외 0% */
const VAT_RATES = [
  { value: "10", label: "10% (일반)" },
  { value: "0", label: "0% (면세·영세·해외)" },
];

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

function findSub(tree: BudgetTree, itemId: string, subName: string): BudgetSub | undefined {
  return tree.find((i) => String(i.id) === itemId)?.subItems.find((s) => s.name === subName);
}

/**
 * 비목(관리형 선택) + 세목·세세목(자유 입력 + 기존값 추천).
 * 새 값은 서버에서 해당 비목 아래로 자동 등록(find-or-create)된다.
 */
function CategorySelects({
  budgetTree,
  initial,
  error,
  onSubChange,
}: {
  budgetTree: BudgetTree;
  initial: Values;
  error?: string;
  /** 세목이 기존 항목과 일치할 때 그 세목(증빙 요건 포함)을 알린다 */
  onSubChange?: (sub: BudgetSub | undefined) => void;
}) {
  const [itemId, setItemId] = useState(initial.budgetItemId ?? "");
  const [subName, setSubName] = useState(initial.budgetSubItemName ?? "");
  const [detailName, setDetailName] = useState(initial.budgetDetailItemName ?? "");

  const item = budgetTree.find((i) => String(i.id) === itemId);
  const subSuggestions = item ? item.subItems.map((s) => s.name) : [];
  const matchedSub = item?.subItems.find((s) => s.name === subName);
  const detailSuggestions = matchedSub ? matchedSub.detailItems.map((d) => d.name) : [];

  const changeItem = (v: string) => {
    setItemId(v);
    onSubChange?.(findSub(budgetTree, v, subName));
  };
  const changeSub = (v: string) => {
    setSubName(v);
    onSubChange?.(findSub(budgetTree, itemId, v));
  };

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div>
        <Label text="비목" required />
        <select name="budgetItemId" value={itemId} onChange={(e) => changeItem(e.target.value)} className={inputCls}>
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
          onChange={(e) => changeSub(e.target.value)} placeholder="예: 연구재료 구입비" className={inputCls + " disabled:bg-slate-100"} />
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

const digits = (s?: string) => Number((s ?? "").replace(/\D/g, "")) || 0;

/** 폼 본문 — 액션 결과마다 부모가 key 를 바꿔 리마운트하므로 상태가 항상 올바른 초기값에서 시작 */
function TxFields({
  v,
  fe,
  budgetTree,
  withEvidence,
}: {
  v: Values;
  fe?: Record<string, string>;
  budgetTree: BudgetTree;
  withEvidence?: boolean;
}) {
  const err = (k: string) => fe?.[k];
  const initialItems = parseInitialItems(v.items);

  const [direction, setDirection] = useState(v.direction ?? "");
  const [itemsTot, setItemsTot] = useState(() => itemsTotal(initialItems));
  const [manual, setManual] = useState(() => digits(v.amount));
  const [vatRate, setVatRate] = useState(v.vatRate ?? "10");
  /** 사용자가 손으로 고친 부가세. null 이면 율로 자동 계산 */
  const [vatEdit, setVatEdit] = useState<number | null>(() => (v.vatAmount ? digits(v.vatAmount) : null));
  /** 금액 입력 기준 — 공급가액을 아는 경우 / 카드 결제액(총액)만 아는 경우 */
  const [mode, setMode] = useState<"supply" | "total">("supply");
  const [totalInput, setTotalInput] = useState(0);
  const [sub, setSub] = useState<BudgetSub | undefined>(() => findSub(budgetTree, v.budgetItemId ?? "", v.budgetSubItemName ?? ""));
  const [attachedCodes, setAttachedCodes] = useState<string[]>([]);

  const rate = Math.trunc(Number(vatRate) || 0);
  const isIn = direction === "IN";
  const totalMode = mode === "total" && itemsTot === 0;

  // 공급가액·부가세 확정 — 품목 합계 > 총액 분리 > 직접 입력 순. 부가세는 자동값 또는 사용자 수정값
  let supply: number;
  let vat: number;
  if (itemsTot > 0) {
    supply = itemsTot;
    vat = vatEdit ?? vatOf(supply, rate);
  } else if (totalMode) {
    ({ supply, vat } = splitTotal(totalInput, rate));
  } else {
    supply = manual;
    vat = vatEdit ?? vatOf(supply, rate);
  }
  const total = supply + vat;

  const switchMode = (next: "supply" | "total") => {
    if (next === mode) return;
    if (next === "total") setTotalInput(total);
    else {
      // 총액 기준에서 계산된 값을 그대로 이어받는다
      setManual(supply);
      setVatEdit(vat);
    }
    setMode(next);
  };

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
          <Label
            text={isIn ? "금액(원)" : "공급가액(원)"}
            required
            hint={itemsTot > 0 ? "품목 합계" : totalMode ? "총액에서 계산" : undefined}
          />
          {/* key: 자기 값에는 의존하지 않고, 다른 곳에서 계산된 값이 바뀔 때만 리마운트 (입력 중 포커스 유지) */}
          <MoneyInput
            key={`amt-${itemsTot}-${mode}-${totalMode ? supply : ""}`}
            name="amount"
            defaultValue={String(supply || "")}
            readOnly={itemsTot > 0 || totalMode}
            onValueChange={(d) => { setManual(Number(d) || 0); setVatEdit(null); }}
          />
          <Err msg={err("amount")} />
        </div>
      </div>

      <CategorySelects budgetTree={budgetTree} initial={v} error={err("budgetItemId")} onSubChange={setSub} />

      {!isIn && (
        <>
          <ItemsEditor initial={initialItems} onTotalChange={setItemsTot} error={err("items")} />

          {/* 부가세 — 연구비 아님(회사 자금), 잔액 계산 제외 */}
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <Label text="부가세율" />
              <select
                name="vatRate"
                value={vatRate}
                onChange={(e) => { setVatRate(e.target.value); setVatEdit(null); }}
                className={inputCls}
              >
                {VAT_RATES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                {!VAT_RATES.some((o) => o.value === vatRate) && <option value={vatRate}>{vatRate}%</option>}
              </select>
              <Err msg={err("vatRate")} />
            </div>
            <div>
              <Label text="부가세(원)" hint={totalMode ? "총액에서 계산" : "자동계산·수정가능"} />
              <MoneyInput
                key={`vat-${supply}-${rate}-${mode}`}
                name="vatAmount"
                defaultValue={String(vat)}
                readOnly={totalMode}
                onValueChange={(d) => setVatEdit(Number(d) || 0)}
              />
              <Err msg={err("vatAmount")} />
            </div>
            <div>
              <Label text="총액(원)" hint={totalMode ? "카드 결제액 입력" : "공급가+부가세"} />
              <MoneyInput
                key={`tot-${mode}-${totalMode ? "" : total}`}
                name="totalAmount"
                defaultValue={String(total || "")}
                readOnly={!totalMode}
                onValueChange={(d) => setTotalInput(Number(d) || 0)}
              />
            </div>
            <div>
              <Label text="입력 기준" hint={itemsTot > 0 ? "(품목 합계 사용 중)" : undefined} />
              <div className="flex flex-col gap-1 pt-1.5 text-sm text-slate-700 sm:flex-row sm:gap-3">
                <label className="flex items-center gap-1">
                  <input type="radio" name="amountMode" value="supply" checked={!totalMode} disabled={itemsTot > 0} onChange={() => switchMode("supply")} />
                  공급가액
                </label>
                <label className="flex items-center gap-1">
                  <input type="radio" name="amountMode" value="total" checked={totalMode} disabled={itemsTot > 0} onChange={() => switchMode("total")} />
                  총액(결제액)
                </label>
              </div>
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            부가세는 회사 자금이라 연구비 잔액에서 제외됩니다. 총액 기준이면 공급가액 = 총액 × 100 / (100 + 세율) 반올림, 부가세 = 나머지.
          </p>

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

          {withEvidence && (
            <>
              <EvidenceReqPanel subName={sub?.name} reqs={sub?.evidenceRequirements ?? []} attachedCodes={attachedCodes} />
              <EvidenceDropInput
                suggestedCodes={(sub?.evidenceRequirements ?? []).map((r) => r.code)}
                error={err("evidenceFile")}
                hint="(선택 · 저장할 때 함께 업로드, 수정 화면에서도 추가 가능)"
                onCodesChange={setAttachedCodes}
              />
            </>
          )}
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
  withEvidence = false,
}: {
  budgetTree: BudgetTree;
  action: Action;
  submitLabel: string;
  defaultValues?: Values;
  hidden?: Record<string, string | number>;
  cancelHref?: string;
  /** 거래 추가 폼: 증빙 파일을 함께 올리는 줄을 보여준다 (수정 화면은 별도 첨부 섹션 사용) */
  withEvidence?: boolean;
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

      {/* 성공(nonce 갱신)·값 변경 시 리마운트 → 품목·증빙·금액 같은 내부 상태까지 초기값으로 */}
      <TxFields
        key={`${state.nonce ?? 0}:${JSON.stringify(v)}`}
        v={v}
        fe={state.fieldErrors}
        budgetTree={budgetTree}
        withEvidence={withEvidence}
      />

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
