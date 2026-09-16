// 비목 계층 유틸 — 앱은 비목/세목/세세목 3단계라 "직접비/간접비" 상위 묶음은 여기서 판정한다.

/** 직접비로 묶이는 비목 (RCMS: 인건비·연구재료비·연구활동비 + 레거시 직접비 성격 비목) */
export const DIRECT_COST_ITEMS = new Set([
  "인건비",
  "연구재료비",
  "연구활동비",
  "연구장비·재료비",
  "연구과제추진비",
  "연구수당",
  "연구결과활용",
]);

export function isDirectCost(itemName: string): boolean {
  return DIRECT_COST_ITEMS.has(itemName);
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
