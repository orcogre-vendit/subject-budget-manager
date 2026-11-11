// 참여율·인건비 계산 — 정수 연산만 (금액 원, 참여율 bp = 0.01%). 서버·클라이언트 공용 순수 함수.
//
// 계상액   = floor(기준연봉 × 참여율 × 참여 개월수 ÷ 12)   (원 미만 버림, 협약서 계산식)
// 월 인건비 = floor(기준연봉 × 참여율 ÷ 12)                 (참고용 표시)
// 현금·현물 각각 편성액(목표)에 맞춰 "고정하지 않은" 사람들의 참여율을 정한다. 합계가 목표를 넘지 않게 버림.

export const FULL_BP = 10000; // 100%

export type FundType = "CASH" | "IN_KIND";
export const FUND_LABEL: Record<FundType, string> = { CASH: "현금", IN_KIND: "현물" };

export type PlanRow = {
  key: string; // 화면용 식별자
  researcherId: string;
  fundType: FundType;
  startMonth: string; // "YYYY-MM"
  endMonth: string; // "YYYY-MM"
  baseSalary: number; // 기준연봉(원)
  rateBp: number; // 참여율(0.01% 단위)
  locked: boolean; // 참여율 고정(자동 계산에서 제외)
  /** (1.6.0 의 끝전 맞춤 잔재) 지정 계상액. 1.7.0 부터 딱 맞추기는 연봉을 조정하므로 새로 생기지 않는다 */
  amountOverride?: number | null;
};

const MONTH_RE = /^(\d{4})-(\d{2})$/;

/** "2026-06" ~ "2027-02" → 9 (양 끝 포함). 잘못된 값이면 0 */
export function monthsBetween(start: string, end: string): number {
  const a = MONTH_RE.exec(start);
  const b = MONTH_RE.exec(end);
  if (!a || !b) return 0;
  const n = (Number(b[1]) - Number(a[1])) * 12 + (Number(b[2]) - Number(a[2])) + 1;
  return n > 0 ? n : 0;
}

/** Date → "YYYY-MM" (UTC 기준 — DB 날짜는 자정 UTC 로 저장됨) */
export function toMonth(d: Date | null | undefined): string {
  if (!d) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthlyPay(baseSalary: number, rateBp: number): number {
  if (baseSalary <= 0 || rateBp <= 0) return 0;
  return Number((BigInt(Math.trunc(baseSalary)) * BigInt(Math.trunc(rateBp))) / BigInt(12 * FULL_BP));
}

/** 참여율로 계산한 계상액 (끝전 지정 무시) */
export function baseAmount(r: Pick<PlanRow, "baseSalary" | "rateBp" | "startMonth" | "endMonth">): number {
  const m = monthsBetween(r.startMonth, r.endMonth);
  if (r.baseSalary <= 0 || r.rateBp <= 0 || m <= 0) return 0;
  return Number((BigInt(Math.trunc(r.baseSalary)) * BigInt(Math.trunc(r.rateBp)) * BigInt(m)) / BigInt(12 * FULL_BP));
}

/** 이 줄의 계상액. 1.6.0 의 끝전 지정(amountOverride)은 1.7.0 에서 계산식이 바뀌어 맞지 않으므로 무시한다 */
export function rowAmount(r: Pick<PlanRow, "baseSalary" | "rateBp" | "startMonth" | "endMonth">): number {
  return baseAmount(r);
}

/** 사람별 참여율 합(같은 계획 안의 모든 행 — 현금+현물) */
export function rateByResearcher(rows: PlanRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.researcherId, (m.get(r.researcherId) ?? 0) + r.rateBp);
  return m;
}

export type SolveMode = "uniform" | "fill";

/**
 * fundType 그룹에서 고정하지 않은 행의 참여율을 목표 금액에 맞춘다.
 * - uniform: 모두 같은 참여율 r (단위 unitBp 로 버림). 사람별 상한(100% − 다른 행 참여율)을 넘지 않게 자른다.
 * - fill: uniform 결과에서 남은 금액을 계상액이 큰 사람부터 한 단위씩 더 올려 잔액을 줄인다.
 * 반환: 바뀐 전체 행 목록 (다른 그룹 행은 그대로)
 */
export function solveRates(rows: PlanRow[], fundType: FundType, target: number, unitBp: number, mode: SolveMode): PlanRow[] {
  const unit = Math.max(1, Math.trunc(unitBp));
  const group = rows.filter((r) => r.fundType === fundType);
  const free = group.filter((r) => !r.locked && r.baseSalary > 0 && monthsBetween(r.startMonth, r.endMonth) > 0);
  if (!free.length) return rows;
  const fixed = group.filter((r) => !free.includes(r)).reduce((s, r) => s + rowAmount(r), 0);
  const budget = target - fixed;

  // 사람별 상한: 100% − (이 사람의 다른 행 참여율). 자유 행끼리는 같은 사람 중복을 고려해 행 수로 나눈다
  const others = new Map<string, number>();
  for (const r of rows) if (!free.includes(r)) others.set(r.researcherId, (others.get(r.researcherId) ?? 0) + r.rateBp);
  const freeCount = new Map<string, number>();
  for (const r of free) freeCount.set(r.researcherId, (freeCount.get(r.researcherId) ?? 0) + 1);
  const cap = (r: PlanRow) => {
    const left = FULL_BP - (others.get(r.researcherId) ?? 0);
    const per = Math.floor(Math.max(0, left) / (freeCount.get(r.researcherId) ?? 1));
    return per - (per % unit);
  };

  const sumAt = (bp: number) => free.reduce((s, r) => s + baseAmount({ ...r, rateBp: Math.min(bp, cap(r)) }), 0);

  // 같은 참여율 r 의 최댓값 (단위 배수) — 이분 탐색
  let lo = 0;
  let hi = Math.floor(FULL_BP / unit);
  if (budget <= 0) hi = 0;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (sumAt(mid * unit) <= budget) lo = mid;
    else hi = mid - 1;
  }
  const r0 = lo * unit;
  const next = new Map(free.map((r) => [r.key, Math.min(r0, cap(r))]));

  if (mode === "fill") {
    let total = free.reduce((s, r) => s + baseAmount({ ...r, rateBp: next.get(r.key)! }), 0);
    const order = [...free].sort((a, b) => baseAmount({ ...b, rateBp: FULL_BP }) - baseAmount({ ...a, rateBp: FULL_BP }));
    let changed = true;
    while (changed) {
      changed = false;
      for (const r of order) {
        const cur = next.get(r.key)!;
        if (cur + unit > cap(r)) continue;
        const delta = baseAmount({ ...r, rateBp: cur + unit }) - baseAmount({ ...r, rateBp: cur });
        if (total + delta <= budget) {
          next.set(r.key, cur + unit);
          total += delta;
          changed = true;
        }
      }
    }
  }
  // 자동 계산한 줄은 끝전 지정을 지운다 (참여율이 바뀌었으므로)
  return rows.map((r) => (next.has(r.key) ? { ...r, rateBp: next.get(r.key)!, amountOverride: null } : r));
}

export type FitResult =
  | { ok: true; rows: PlanRow[]; key: string; rateBp: number; salaryFrom: number; salaryTo: number }
  | { ok: false; reason: string };

/**
 * 마지막 사람으로 딱 맞추기 — 그룹의 마지막 줄 참여율을 0.01% 단위로 올려 목표에 최대한 붙이고,
 * 남는 우수리는 그 사람의 기준연봉을 조금 올려서(원 단위) 합계를 목표와 같게 만든다.
 * 계상액 = floor(연봉 × 참여율 × 개월 ÷ 12) 이라 연봉 1원이 계상액 1원 미만으로 움직여 원 단위까지 맞출 수 있다.
 * 그 줄은 🔒 고정해서 이후 자동 계산에서 바뀌지 않게 한다.
 */
export function fitExact(rows: PlanRow[], fundType: FundType, target: number): FitResult {
  const group = rows.filter((r) => r.fundType === fundType);
  const last = [...group].reverse().find((r) => r.baseSalary > 0 && monthsBetween(r.startMonth, r.endMonth) > 0);
  if (!last) return { ok: false, reason: "기준연봉과 참여기간이 들어간 줄이 없습니다." };
  const others = group.filter((r) => r !== last).reduce((s, r) => s + rowAmount(r), 0);
  const need = target - others;
  if (need < 0) return { ok: false, reason: `다른 사람들 계상액이 이미 목표보다 ${(-need).toLocaleString("ko-KR")}원 많습니다.` };

  const used = rows.filter((r) => r !== last && r.researcherId === last.researcherId).reduce((s, r) => s + r.rateBp, 0);
  const cap = Math.max(0, FULL_BP - used);
  // 1) 지금 연봉으로 목표를 넘지 않는 가장 큰 참여율(0.01% 단위)
  let lo = 0;
  let hi = cap;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (baseAmount({ ...last, rateBp: mid }) <= need) lo = mid;
    else hi = mid - 1;
  }
  const amount = baseAmount({ ...last, rateBp: lo });
  const remainder = need - amount;
  if (remainder > 0 && lo === 0) return { ok: false, reason: "마지막 사람의 참여율을 0.01%도 줄 수 없어 맞출 수 없습니다." };
  // 상한에 걸려 0.01% 한 단계보다 많이 모자라면 연봉을 크게 올려야 하므로 맞추지 않는다
  const nextStep = baseAmount({ ...last, rateBp: lo + 1 }) - amount;
  if (lo === cap && remainder > 0 && remainder >= Math.max(1, nextStep)) {
    return { ok: false, reason: `마지막 사람이 참여율 상한(${fmtRate(cap)}%)에 걸려 ${remainder.toLocaleString("ko-KR")}원이 모자랍니다.` };
  }
  // 2) 우수리를 연봉으로: floor(S × bp × m / 120000) = need 가 되는 가장 작은 S
  let salary = last.baseSalary;
  if (remainder > 0) {
    const m = BigInt(monthsBetween(last.startMonth, last.endMonth));
    const k = BigInt(lo) * m; // 연봉 1원당 계상액 증가분 × 120000
    const denom = BigInt(12 * FULL_BP);
    salary = Number((BigInt(need) * denom + k - BigInt(1)) / k); // ceil(need × 120000 / k)
    const at = (sv: number) => Number((BigInt(sv) * k) / denom);
    // 한 해를 넘는 기간(1원당 1원 넘게 움직임)에서 정확히 안 떨어지면 맞출 수 없다
    if (at(salary) !== need) {
      return { ok: false, reason: `참여기간이 12개월을 넘어 연봉 1원 단위로도 ${remainder.toLocaleString("ko-KR")}원을 정확히 맞출 수 없습니다.` };
    }
  }
  const out = rows.map((r) => (r === last ? { ...r, rateBp: lo, baseSalary: salary, locked: true, amountOverride: null } : r));
  return { ok: true, rows: out, key: last.key, rateBp: lo, salaryFrom: last.baseSalary, salaryTo: salary };
}

/** 참여율 표시: 3000 → "30", 3050 → "30.5", 3055 → "30.55" */
export function fmtRate(bp: number): string {
  const s = (bp / 100).toFixed(2);
  return s.replace(/\.?0+$/, "");
}

/** "30.5" → 3050. 소수 둘째 자리까지, 0~100. 잘못된 값이면 null */
export function parseRate(input: string): number | null {
  const s = input.replace(/[%\s]/g, "");
  if (s === "") return 0;
  if (!/^\d{1,3}(\.\d{0,2})?$/.test(s)) return null;
  const [i, f = ""] = s.split(".");
  const bp = Number(i) * 100 + Number((f + "00").slice(0, 2));
  return bp <= FULL_BP ? bp : null;
}
