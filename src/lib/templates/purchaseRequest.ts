// 품의서(구매의뢰서 겸용) — flex 복붙용 텍스트
import { n, type DocContext } from "./types";

/** 한글/전각 문자는 2칸으로 계산하는 표시 폭 */
function dispWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) > 0x2e7f ? 2 : 1;
  return w;
}
const padR = (s: string, w: number) => s + " ".repeat(Math.max(0, w - dispWidth(s)));
const padL = (s: string, w: number) => " ".repeat(Math.max(0, w - dispWidth(s))) + s;
const cut = (s: string, w: number) => {
  let out = "";
  for (const ch of s) {
    if (dispWidth(out + ch) > w) break;
    out += ch;
  }
  return out;
};

const W = { name: 16, spec: 10, qty: 6, unit: 12, amt: 12 } as const;

export function renderPurchaseRequest(c: DocContext): string {
  const line = (l: string, m: string, r: string) =>
    `${l}${"─".repeat(W.name)}${m}${"─".repeat(W.spec)}${m}${"─".repeat(W.qty)}${m}${"─".repeat(W.unit)}${m}${"─".repeat(W.amt)}${r}`;
  const row = (a: string, b: string, cq: string, d: string, e: string) =>
    `│${padR(cut(a, W.name), W.name)}│${padR(cut(b, W.spec), W.spec)}│${padL(cq, W.qty)}│${padL(d, W.unit)}│${padL(e, W.amt)}│`;

  const rows = c.items.length
    ? c.items.map((it) => row(it.name, it.spec || "-", String(it.quantity), n(it.unitPrice), n(it.amount)))
    : [row(c.itemSummary || "-", "-", "1", n(c.supplyAmount), n(c.supplyAmount))];

  return [
    "구 매 의 뢰 서 (품의서)",
    "",
    "1. 과제정보",
    ` - 과제번호 : ${c.project.code}`,
    ` - 과 제 명 : ${c.project.name}`,
    ` - 비    목 : ${c.budgetPath}`,
    "",
    "2. 구매 내역",
    " " + line("┌", "┬", "┐"),
    " " + row("품목명", "규격", "수량", "단가(원)", "금액(원)"),
    " " + line("├", "┼", "┤"),
    ...rows.map((r) => " " + r),
    " " + line("└", "┴", "┘"),
    `                              공급가액 합계  ${n(c.supplyAmount)}원`,
    `                              부가가치세     ${n(c.vatAmount)}원   ※ 회사 자금, 연구비 계상 불가`,
    `                              총액           ${n(c.totalAmount)}원`,
    "",
    "3. 구매 사유 (과제와의 직접적 관련성)",
    ` ${c.purpose}`,
    "",
    `4. 구매처 : ${c.vendor}`,
    `5. 결제수단 : ${c.paymentMethod}   ※ 연구비카드 / RCMS 계좌이체`,
    `6. 구매(예정)일 : ${c.purchaseDate}`,
    "",
    "※ 본 품의는 flex 전자결재로 승인 (별도 인장·서명 생략)",
    "",
    `                        ${c.today}`,
    `                        요청자 : ${c.requester}`,
  ].join("\n");
}
