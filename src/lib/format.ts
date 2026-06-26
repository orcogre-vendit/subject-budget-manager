/** 원 단위 정수를 한국 통화 형식으로 (예: 1234567 → "1,234,567원") */
export function won(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

/** 집행률(%) — 출금합계/예산. 예산 0이면 0 반환 */
export function executionRate(spent: number, budget: number): number {
  if (budget <= 0) return 0;
  return Math.round((spent / budget) * 1000) / 10;
}

/** 콤마 구분 숫자 (단위 없이) */
export function num(value: number): string {
  return value.toLocaleString("ko-KR");
}

/** 주민등록번호 마스킹: "690811-2******" */
export function maskSsn(v?: string | null): string {
  if (!v) return "-";
  const d = v.replace(/\D/g, "");
  if (d.length < 7) return "******";
  return `${d.slice(0, 6)}-${d[6]}******`;
}

/** 계좌번호 마스킹: 뒤 4자리만 노출 */
export function maskAccount(v?: string | null): string {
  if (!v) return "-";
  const d = v.replace(/\s/g, "");
  if (d.length <= 4) return "*".repeat(d.length);
  return `${"*".repeat(d.length - 4)}${d.slice(-4)}`;
}

/** Date → "YYYY-MM-DD" */
export function ymd(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}
