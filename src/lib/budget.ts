// 비목 계층 유틸 — 앱은 비목/세목/세세목 3단계라 "직접비/간접비" 상위 묶음은 여기서 판정한다.

import { DIRECT_COST_ITEM_NAMES, normalizeCategoryName } from "./budgetStandard";

/** 직접비로 묶이는 비목 — 표준 분류(src/lib/budgetStandard.ts)에서 파생. 이름은 정규화해 비교 */
export const DIRECT_COST_ITEMS = new Set(DIRECT_COST_ITEM_NAMES.map(normalizeCategoryName));

export function isDirectCost(itemName: string): boolean {
  return DIRECT_COST_ITEMS.has(normalizeCategoryName(itemName));
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
