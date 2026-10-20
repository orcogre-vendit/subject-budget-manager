// 비목 계층 유틸 — 앱은 비목/세목/세세목 3단계라 "직접비/간접비" 상위 묶음은 여기서 판정한다.

import { DIRECT_COST_ITEM_NAMES, normalizeCategoryName } from "./budgetStandard";

/** 직접비로 묶이는 비목 — 표준 분류(src/lib/budgetStandard.ts)에서 파생. 이름은 정규화해 비교 */
export const DIRECT_COST_ITEMS = new Set(DIRECT_COST_ITEM_NAMES.map(normalizeCategoryName));

export function isDirectCost(itemName: string): boolean {
  return DIRECT_COST_ITEMS.has(normalizeCategoryName(itemName));
}

type Flow = { direction: string; amount: number; status?: string; budgetAdjust?: boolean | null };

/**
 * 편성 증감 — 입금(편성)은 +, 편성 조정 출금(감액)은 −. 일반 출금은 0.
 * 협약변경 같은 재배분은 기존 편성 레코드를 고치지 않고 조정 레코드(+입금/−출금)를 추가하는 복식부기 방식.
 */
export function allocationOf(t: Flow): number {
  if (t.status === "취소") return 0;
  if (t.direction === "IN") return t.amount;
  return t.budgetAdjust ? -t.amount : 0;
}

/** 집행액 — 편성 조정 출금은 집행이 아니므로 0 */
export function spendingOf(t: Flow): number {
  if (t.status === "취소") return 0;
  return t.direction === "OUT" && !t.budgetAdjust ? t.amount : 0;
}

/** "직접비 > 연구재료비 > 연구재료 구입비" 형태의 비목 경로 */
export function budgetPathOf(
  item?: string | null,
  sub?: string | null,
  detail?: string | null,
): string {
  if (!item) return "-";
  return [isDirectCost(item) ? "직접비" : null, item, sub || null, detail || null]
    .filter(Boolean)
    .join(" > ");
}
