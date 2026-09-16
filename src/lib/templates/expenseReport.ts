// 지출결의 본문 — flex 복붙용. 부가세가 있으면 (A)연구비 + (B)부가세 2건.
import { n, type DocContext } from "./types";

/** (A) 연구비(공급가액) 건 — RCMS 로만 집행 */
export function renderExpenseReportSupply(c: DocContext): string {
  const vatNote =
    c.vatAmount > 0
      ? `- 부가가치세 ${n(c.vatAmount)}원은 별도 지결로 진행합니다 (회사 자금, 연구비 계상 불가)\n`
      : "";
  return [
    "[제목]",
    `${c.yy}년 ${c.m}월 ${c.project.short} ${c.itemSummary} 지출결의 (연구비, 공급가액)`,
    "",
    "[지출결의 품목]",
    `${c.project.name} - ${c.itemSummary} - 공급가액`,
    "",
    "[지출결의 목적]",
    `과제번호 ${c.project.code} 「${c.project.name}」`,
    c.purpose,
    "",
    `- 비목: ${c.budgetPath}`,
    "- 재원: 정부 연구개발비 (연구비 전용계좌)",
    `- 세금계산서 발행일: ${c.invoiceDate}`,
    "",
    `[거래처] ${c.vendor}`,
    `[금액] ${n(c.supplyAmount)} 원`,
    `[은행명] ${c.vendorBank}`,
    `[계좌번호] ${c.vendorAccount}`,
    `[예금주명] ${c.vendorHolder}`,
    `[지급 기한] ${c.paymentDueDate}`,
    "",
    "[비고]",
    "[중요 — 연구비 통장에서 직접 이체 금지]",
    "이 건은 정부 연구개발비이므로 반드시 RCMS 시스템을 통해서만 집행해야 합니다.",
    "연구비 전용계좌에서 인터넷뱅킹·텔레뱅킹으로 직접 이체하면 정산에서 전액",
    "불인정되며 회수 대상이 됩니다.",
    "",
    " 집행 경로",
    ` RCMS > 연구비관리 > 연구비사용등록 > ${c.evidenceType}`,
    `  → ${c.evidenceLookup}`,
    `  → 비목 선택 (${c.budgetPath})`,
    '  → 좌측 하단 "공급가액만" 체크 (부가세 제외하고 등록)',
    "  → 사용요청 → 법인범용공인인증서 전자서명 → 이체비밀번호 입력",
    "  → 이체 실행 (평일 09:00~20:00, 공휴일 불가)",
    "",
    `${vatNote}- RCMS 문의 1661-5855 / 사내 문의 ${c.contact}`,
  ].join("\n");
}

/** (B) 부가세 건 — 회사 법인계좌 일반 이체, RCMS 대상 아님 (vatAmount > 0 일 때만) */
export function renderExpenseReportVat(c: DocContext): string {
  return [
    "[제목]",
    `${c.yy}년 ${c.m}월 ${c.project.short} ${c.itemSummary} 지출결의 (부가세)`,
    "",
    "[지출결의 품목]",
    `${c.project.name} - ${c.itemSummary} - 부가가치세`,
    "",
    "[지출결의 목적]",
    `과제번호 ${c.project.code} ${c.itemSummary}(공급가액 ${n(c.supplyAmount)}원)에 대한 부가가치세 납부`,
    "「국가연구개발사업 연구개발비 사용 기준」상 환급 가능한 부가가치세는",
    "연구개발비로 계상할 수 없으므로, 회사 자금으로 별도 지급함",
    "",
    `[거래처] ${c.vendor}`,
    `[금액] ${n(c.vatAmount)} 원`,
    `[은행명] ${c.vendorBank} / [계좌번호] ${c.vendorAccount} / [예금주명] ${c.vendorHolder}`,
    `[지급 기한] ${c.paymentDueDate}`,
    "",
    "[비고]",
    "[지급 통장 — 회사 법인계좌]",
    "연구비 전용계좌가 아닌 회사 법인계좌에서 일반 이체로 지급합니다. RCMS 등록 대상이 아닙니다.",
    "",
    "[회계 처리]",
    "- 부가세대급금(자산)으로 처리 — 비용이 아니므로 손익 영향 없음",
    "- 다음 부가세 신고 시 매입세액 공제로 전액 회수",
    "- 세금계산서를 회계팀에 반드시 전달 (누락 시 공제 못 받아 실손실 발생)",
    "",
    `- 공급가액 ${n(c.supplyAmount)}원은 별도 지결로 RCMS 통해 집행합니다`,
    `- 사내 문의 ${c.contact}`,
  ].join("\n");
}
