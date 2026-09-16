// RCMS 사용등록 건 ↔ 우리 장부 품의(Transaction) 매칭 규칙 + 대조 경고 규칙. 순수 함수(DB 무관).
import { budgetPathOf } from "@/lib/budget";
import { norm, parseRcmsBudgetPath } from "./parse";

export type RecLite = {
  id: number;
  useDate: Date | null;
  registeredAt: Date | null;
  progress: string | null;
  supplyAmount: number;
  vatAmount: number;
  useAmount: number;
  vendor: string | null;
  budgetPath: string | null;
  transactionId: number | null;
  missingSince: Date | null;
};

export type TxLite = {
  id: number;
  date: Date;
  status: string;
  direction: string;
  amount: number;
  vatAmount: number;
  plannedAmount: number | null;
  vendor: string | null;
  description: string | null;
  budgetItem: { name: string } | null;
  budgetSubItem: { name: string } | null;
  budgetDetailItem: { name: string } | null;
};

const DAY = 86_400_000;
const normName = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[\s()\[\]㈜주식회사.,\-_]/g, "");

export function txBudgetPath(tx: TxLite): string {
  return budgetPathOf(tx.budgetItem?.name, tx.budgetSubItem?.name, tx.budgetDetailItem?.name);
}

export function samePath(recPath: string | null, tx: TxLite): boolean {
  if (!recPath) return false;
  return norm(recPath) === norm(txBudgetPath(tx));
}

/** 매칭 점수. 금액이 맞지 않으면 후보가 아님(null). 3 이상이면 자동매칭 대상 */
export function matchScore(rec: RecLite, tx: TxLite): number | null {
  if (tx.direction !== "OUT" || tx.status === "취소") return null;
  let score: number;
  if (rec.supplyAmount > 0 && rec.supplyAmount === tx.amount) score = 3;
  else if (rec.useAmount > 0 && rec.useAmount === tx.amount + tx.vatAmount) score = 3;
  else if (rec.useAmount > 0 && rec.useAmount === tx.amount) score = 2; // 품의를 총액으로 넣은 경우
  else return null;

  if (rec.useDate) {
    const days = Math.abs(rec.useDate.getTime() - tx.date.getTime()) / DAY;
    score += days <= 3 ? 2 : days <= 14 ? 1 : days <= 45 ? 0 : -1;
  }
  const rv = normName(rec.vendor);
  const tv = normName(tx.vendor);
  if (rv && tv && (rv.includes(tv) || tv.includes(rv))) score += 2;
  if (samePath(rec.budgetPath, tx)) score += 1;
  return score;
}

/** 후보 목록 (점수 내림차순) */
export function candidates(rec: RecLite, txs: TxLite[]): { tx: TxLite; score: number }[] {
  return txs
    .map((tx) => ({ tx, score: matchScore(rec, tx) }))
    .filter((c): c is { tx: TxLite; score: number } => c.score !== null)
    .sort((a, b) => b.score - a.score);
}

/** 자동 매칭: 금액이 맞고(≥3) 1위가 유일한 경우만. 거래 하나는 한 건에만 */
export function autoMatch(records: RecLite[], txs: TxLite[]): { recordId: number; txId: number }[] {
  const taken = new Set<number>();
  const out: { recordId: number; txId: number }[] = [];
  for (const rec of records) {
    if (rec.transactionId) continue;
    const cs = candidates(rec, txs.filter((t) => !taken.has(t.id)));
    if (!cs.length || cs[0].score < 3) continue;
    if (cs.length > 1 && cs[1].score === cs[0].score) continue; // 동점이면 사람이 고른다
    taken.add(cs[0].tx.id);
    out.push({ recordId: rec.id, txId: cs[0].tx.id });
  }
  return out;
}

// ---------- 대조 경고 ----------

export type Warning = {
  level: "danger" | "warn" | "info";
  code: "OVER_BUDGET" | "RCMS_ONLY" | "UNREGISTERED" | "PLAN_DIFF" | "PATH_MISMATCH" | "RCMS_DRAFT" | "TRANSFERRED";
  message: string;
  txId?: number;
  recordId?: number;
};

export type ItemRow = {
  name: string;
  allocated: number; // 입금(편성)
  rcms: number; // RCMS 등록 공급가 합
  pending: number; // 미등록 품의 공급가 합
  available: number; // allocated − rcms − pending
};

/** RCMS 비목정보에서 우리 비목명 */
export function recItemName(rec: { budgetPath: string | null }): string {
  return parseRcmsBudgetPath(rec.budgetPath).item ?? "(미분류)";
}

export function buildItemRows(txs: TxLite[], records: RecLite[]): ItemRow[] {
  const map = new Map<string, ItemRow>();
  const row = (name: string) => {
    let r = map.get(name);
    if (!r) { r = { name, allocated: 0, rcms: 0, pending: 0, available: 0 }; map.set(name, r); }
    return r;
  };
  const matchedTx = new Set(records.map((r) => r.transactionId).filter((v): v is number => v !== null));
  for (const tx of txs) {
    if (tx.status === "취소") continue;
    const name = tx.budgetItem?.name ?? "(미분류)";
    if (tx.direction === "IN") row(name).allocated += tx.amount;
    else if (!matchedTx.has(tx.id)) row(name).pending += tx.amount;
  }
  for (const rec of records) row(recItemName(rec)).rcms += rec.supplyAmount;
  for (const r of map.values()) r.available = r.allocated - r.rcms - r.pending;
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export function buildWarnings(txs: TxLite[], records: RecLite[], items: ItemRow[], now = new Date()): Warning[] {
  const w: Warning[] = [];
  const fmt = (n: number) => n.toLocaleString("ko-KR");
  const ageDays = (d: Date | null) => (d ? Math.floor((now.getTime() - d.getTime()) / DAY) : 0);
  const txById = new Map(txs.map((t) => [t.id, t]));

  for (const it of items) {
    if (it.available < 0)
      w.push({ level: "danger", code: "OVER_BUDGET", message: `${it.name}: 가용잔액 ${fmt(it.available)}원 — RCMS 등록 ${fmt(it.rcms)}원 + 미등록 품의 ${fmt(it.pending)}원이 편성 ${fmt(it.allocated)}원을 초과` });
  }
  for (const rec of records) {
    if (!rec.transactionId) {
      w.push({ level: "warn", code: "RCMS_ONLY", message: `RCMS 등록 건에 대응하는 품의가 없음: ${rec.vendor ?? "-"} ${fmt(rec.supplyAmount)}원 (${rec.useDate ? rec.useDate.toISOString().slice(0, 10) : "-"})`, recordId: rec.id });
      continue;
    }
    const tx = txById.get(rec.transactionId);
    if (tx) {
      if (tx.plannedAmount !== null && tx.plannedAmount !== tx.amount)
        w.push({ level: "info", code: "PLAN_DIFF", message: `품의 ${fmt(tx.plannedAmount)}원 → 실집행 ${fmt(tx.amount)}원 (${tx.description ?? tx.vendor ?? ""})`, txId: tx.id, recordId: rec.id });
      if (rec.budgetPath && !samePath(rec.budgetPath, tx))
        w.push({ level: "warn", code: "PATH_MISMATCH", message: `비목 불일치: 장부 "${txBudgetPath(tx)}" vs RCMS "${rec.budgetPath}" (${tx.description ?? ""})`, txId: tx.id, recordId: rec.id });
    }
    if (rec.progress === "임시저장" && !rec.missingSince && ageDays(rec.registeredAt) >= 7)
      w.push({ level: "warn", code: "RCMS_DRAFT", message: `RCMS 임시저장 상태로 ${ageDays(rec.registeredAt)}일 경과: ${rec.vendor ?? "-"} ${fmt(rec.supplyAmount)}원 — RCMS 에서 등록을 완료하세요`, recordId: rec.id });
    if (rec.missingSince)
      w.push({ level: "info", code: "TRANSFERRED", message: `이체 실행 완료로 추정 (${rec.missingSince.toISOString().slice(0, 10)} 이후 대상 목록에서 사라짐): ${rec.vendor ?? "-"} ${fmt(rec.supplyAmount)}원`, recordId: rec.id });
  }
  const matchedTx = new Set(records.map((r) => r.transactionId));
  for (const tx of txs) {
    if (tx.direction !== "OUT" || tx.status === "취소" || matchedTx.has(tx.id)) continue;
    const age = ageDays(tx.date);
    if (age >= 14)
      w.push({ level: "warn", code: "UNREGISTERED", message: `품의 후 ${age}일 지났지만 RCMS 미등록: ${tx.description ?? tx.vendor ?? "-"} ${fmt(tx.amount)}원`, txId: tx.id });
  }
  const order = { danger: 0, warn: 1, info: 2 };
  return w.sort((a, b) => order[a.level] - order[b.level]);
}
