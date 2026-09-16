// 금액 계산 — 모두 정수(원) 연산. 부동소수점 누적 금지.

/** 부가세(원) = 공급가액 × 율(%) 를 반올림. 정수만 사용 (Math.trunc로 소수 절단) */
export function vatOf(supplyAmount: number, ratePercent: number): number {
  if (supplyAmount <= 0 || ratePercent <= 0) return 0;
  // (a*r + 50) / 100 의 정수부 = 반올림. 피연산자가 정수라 결과 정수부는 정확.
  return Math.trunc((supplyAmount * ratePercent + 50) / 100);
}

/** 품목 금액 = 수량 × 단가 (정수) */
export function lineAmount(quantity: number, unitPrice: number): number {
  return Math.trunc(quantity) * Math.trunc(unitPrice);
}

/** 원 → 천원 (반올림). 대조표·슬랙 게시처럼 천원 단위가 명시된 곳에서만 사용 */
export function toThousands(won: number): number {
  const sign = won < 0 ? -1 : 1;
  return sign * Math.trunc((Math.abs(won) + 500) / 1000);
}

/** 천원 단위 콤마 표기 (예: 67401000 → "67,401") */
export function fmtThousands(won: number): string {
  return toThousands(won).toLocaleString("ko-KR");
}

/** 소진율(%) = 집행/편성 × 100, 소수 1자리. 편성 0이면 0 */
export function usageRate(spent: number, budget: number): number {
  if (budget <= 0) return 0;
  return Math.trunc((spent * 1000 + budget / 2) / budget) / 10;
}
