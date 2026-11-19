// 협약변경 계산·점검 — 순수 함수(서버·클라이언트 공용). 금액은 원 단위 정수.
// 규정 근거: docs/연구개발비-사용기준-핵심요약.md 5절 "사전승인이 필요한 변경 vs 통보로 되는 변경" (혁신법 매뉴얼 제13절 마)

import { normalizeCategoryName } from "./budgetStandard";

export type AmendFund = "CASH" | "IN_KIND";

export type AmendLine = {
  key: string;
  itemName: string;
  subName: string | null;
  detailName: string | null;
  fundType: AmendFund;
  inLedger: boolean;
  beforeAmt: number;
  afterAmt: number;
  note: string | null;
};

const n = (s: string | null | undefined) => normalizeCategoryName(s ?? "");

/** 장부 키 — 비목|세목|세세목 (이름 정규화) */
export function lineKey(item: string, sub: string | null, detail: string | null): string {
  return [n(item), n(sub), n(detail)].join("|");
}
/** 세목 키 — 세세목은 묶어서 (집행 점검용) */
export function subKey(item: string, sub: string | null): string {
  return [n(item), n(sub)].join("|");
}

export const isItem = (line: { itemName: string }, name: string) => n(line.itemName) === n(name);

export type Totals = { before: number; after: number };
export function totals(lines: AmendLine[], pick: (l: AmendLine) => boolean = () => true): Totals {
  return lines.filter(pick).reduce((t, l) => ({ before: t.before + l.beforeAmt, after: t.after + l.afterAmt }), { before: 0, after: 0 });
}

export type Finding = { level: "error" | "approval" | "warn" | "ok"; text: string };

const won = (v: number) => `${v.toLocaleString("ko-KR")}원`;
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("ko-KR")}원`;

/**
 * 점검 — 오류(반영 불가), 사전승인 대상, 주의, 통보로 가능.
 * spentBySub / spentByItem: 장부 집행액(신청 중 포함, 조정 제외). 키는 subKey / n(item)
 */
export function review(
  lines: AmendLine[],
  spentBySub: Map<string, number>,
  spentByItem: Map<string, number>,
  opts: { forProfit: boolean } = { forProfit: true },
): Finding[] {
  const out: Finding[] = [];

  // ── 오류 ──
  const seen = new Set<string>();
  for (const l of lines) {
    const k = `${lineKey(l.itemName, l.subName, l.detailName)}|${l.fundType}|${l.inLedger ? 1 : 0}`;
    if (!l.itemName.trim()) out.push({ level: "error", text: "비목이 비어 있는 줄이 있습니다." });
    if (seen.has(k)) out.push({ level: "error", text: `같은 줄이 두 번 있습니다: ${[l.itemName, l.subName, l.detailName].filter(Boolean).join(" > ")}` });
    seen.add(k);
    if (l.afterAmt < 0 || l.beforeAmt < 0) out.push({ level: "error", text: `금액은 0 이상이어야 합니다: ${l.itemName}` });
  }
  // 이미 쓴 돈보다 작게 줄이면 안 됨 (장부 현금 줄, 세목·비목 단위)
  const ledger = lines.filter((l) => l.inLedger && l.fundType === "CASH");
  const afterBySub = new Map<string, number>();
  const afterByItem = new Map<string, number>();
  for (const l of ledger) {
    afterBySub.set(subKey(l.itemName, l.subName), (afterBySub.get(subKey(l.itemName, l.subName)) ?? 0) + l.afterAmt);
    afterByItem.set(n(l.itemName), (afterByItem.get(n(l.itemName)) ?? 0) + l.afterAmt);
  }
  for (const [k, after] of afterByItem) {
    const spent = spentByItem.get(k) ?? 0;
    const name = ledger.find((l) => n(l.itemName) === k)?.itemName ?? k;
    if (after < spent) out.push({ level: "error", text: `${name}: 변경 후 ${won(after)} 이 이미 집행(신청 중 포함)한 ${won(spent)} 보다 적습니다.` });
  }
  for (const [k, spent] of spentBySub) {
    const [item, sub] = k.split("|");
    if (!sub || !afterByItem.has(item)) continue;
    // 세목에 편성이 없는데 집행이 있는 경우(비목 공통 편성으로 쓴 경우)는 비목 단위 점검으로 충분
    if (!afterBySub.has(k)) continue;
    const after = afterBySub.get(k)!;
    if (after < spent) {
      const l = ledger.find((x) => subKey(x.itemName, x.subName) === k)!;
      out.push({ level: "warn", text: `${l.itemName} > ${l.subName}: 변경 후 ${won(after)} 이 이 세목 집행 ${won(spent)} 보다 적습니다. RCMS 세목 잔액을 확인하세요.` });
    }
  }

  // ── 사전승인 판정 ──
  const all = totals(lines);
  const cash = totals(lines, (l) => l.fundType === "CASH");
  const kind = totals(lines, (l) => l.fundType === "IN_KIND");
  if (all.after !== all.before) out.push({ level: "approval", text: `연구개발비 총액이 바뀝니다 (${signed(all.after - all.before)}). 사전승인 대상입니다.` });
  if (cash.after !== cash.before || kind.after !== kind.before)
    out.push({ level: "approval", text: `현금 ${signed(cash.after - cash.before)} · 현물 ${signed(kind.after - kind.before)} — 연도별 정부지원금·기관부담금(현금·현물) 변경은 사전승인 대상입니다.` });

  const item = (name: string, fund?: AmendFund) => totals(lines, (l) => isItem(l, name) && (!fund || l.fundType === fund));
  const indirect = item("간접비");
  if (indirect.after > indirect.before) out.push({ level: "approval", text: `간접비 증액 ${signed(indirect.after - indirect.before)} — 사전승인 대상입니다.` });

  if (opts.forProfit) {
    const pc = totals(lines, (l) => isItem(l, "인건비") && l.fundType === "CASH");
    if (pc.after !== pc.before) out.push({ level: "approval", text: `현금 인건비 총액 변경 ${signed(pc.after - pc.before)} — 영리기관은 사전승인 대상입니다.` });
    const lab = totals(lines, (l) => n(l.subName) === n("연구실운영비"));
    if (lab.after > lab.before) out.push({ level: "approval", text: `연구실운영비 증액 ${signed(lab.after - lab.before)} — 영리기관은 사전승인 대상입니다.` });
  }
  const ent = item("위탁연구개발비");
  if (ent.before > 0 && (ent.after - ent.before) * 5 >= ent.before)
    out.push({ level: "approval", text: `위탁연구개발비 20% 이상 증액 (${signed(ent.after - ent.before)}) — 사전승인 대상입니다.` });
  else if (ent.before === 0 && ent.after > 0) out.push({ level: "approval", text: `위탁연구개발비 신설 ${won(ent.after)} — 사전승인 대상입니다.` });
  const allow = item("연구수당");
  if (allow.after > allow.before) out.push({ level: "approval", text: `연구수당 증액 ${signed(allow.after - allow.before)} — 사전승인 대상입니다 (직접비 내 전용으로도 불가).` });

  // ── 주의 ──
  if (opts.forProfit) {
    const direct = totals(lines, (l) => !isItem(l, "간접비") && !isItem(l, "위탁연구개발비") && l.fundType === "CASH");
    const ext = totals(lines, (l) => n(l.subName) === n("외부 전문기술 활용비") && l.fundType === "CASH");
    if (direct.after > 0 && ext.after * 10 > direct.after * 4)
      out.push({ level: "warn", text: `외부 전문기술 활용비 ${won(ext.after)} 가 현금 직접비 ${won(direct.after)} 의 40%를 넘습니다(영리기관 한도).` });
  }

  const changed = lines.some((l) => l.afterAmt !== l.beforeAmt);
  if (!changed) out.push({ level: "warn", text: "바뀐 금액이 없습니다." });
  if (changed && !out.some((f) => f.level === "approval" || f.level === "error"))
    out.push({ level: "ok", text: "직접비 안에서 항목 간 전용입니다. 사전승인 없이 RCMS(통합정보시스템)에 변경 내용을 등록해 통보하면 됩니다." });
  return out;
}

/** 대비표 금액 표기 — 천원 단위(나누어떨어지지 않으면 소수) */
export function fmtThousand(v: number): string {
  if (v % 1000 === 0) return (v / 1000).toLocaleString("ko-KR");
  return (v / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 3 });
}
