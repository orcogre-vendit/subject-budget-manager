// 품의서 — flex 워크플로우 "__년 _월 _________ 품의서" 양식의 칸 순서대로 붙여넣기용 텍스트.
// flex 양식 칸: 제목 / 목적 / 은행 / 계좌번호 / 지급액 / 예금주명 / 지급일자 / 비고 / 첨부파일(20MB 이하, 최대 30개)
import { evidenceLabel } from "@/lib/evidence";
import { fmtUnitPrice } from "@/lib/money";
import { n, type DocContext } from "./types";

const dash = (s: string) => (s && s !== "-" ? s : "-");

/** 제목: "(영수 년도)년 (영수 해당월)월 (목적) (용도) 품의서" → 예: "26년 9월 연구재료 구입비 BLE 개발보드 외 1건 품의서" */
export function purchaseRequestTitle(c: DocContext): string {
  const purpose = c.subItemName !== "-" ? c.subItemName : c.budgetPath.split(">").pop()?.trim() ?? "연구비";
  return `${c.yy}년 ${c.m}월 ${purpose} ${c.itemSummary} 품의서`;
}

export function renderPurchaseRequest(c: DocContext): string {
  const isCard = c.paymentMethod.includes("카드");
  const itemLines = c.items.length
    ? c.items.map((it) => ` - ${it.name}${it.spec ? ` (${it.spec})` : ""} ${n(it.quantity)}개 × ${fmtUnitPrice(it.unitPrice)}원 = ${n(it.amount)}원`)
    : [` - ${c.itemSummary} ${n(c.supplyAmount)}원`];
  // 품의 시점에 flex 에 올리는 건 견적서뿐. 거래명세서·세금계산서·검수 사진은 구매 뒤 RCMS 증빙
  const quotes = c.attachments.filter((a) => a.code === "QUOTE");
  const files = quotes.length
    ? quotes.map((a) => ` - ${a.name} (${evidenceLabel(a.code)})`)
    : [" - 견적서 (아직 미첨부 — 견적서를 올린 뒤 품의서를 다시 생성하세요)"];

  return [
    "■ 제목",
    purchaseRequestTitle(c),
    "",
    "■ 목적",
    c.purpose,
    ` - 과제: ${c.project.code} ${c.project.name}`,
    ` - 비목: ${c.budgetPath}`,
    " - 품목:",
    ...itemLines,
    ` - 공급가액 ${n(c.supplyAmount)}원 + 부가세 ${n(c.vatAmount)}원 = 총액 ${n(c.totalAmount)}원 (부가세는 회사 자금, 연구비 계상 불가)`,
    "",
    "■ 은행",
    isCard ? "- (연구비카드 결제)" : dash(c.vendorBank),
    "",
    "■ 계좌번호",
    isCard ? "- (연구비카드 결제)" : dash(c.vendorAccount),
    "",
    "■ 지급액",
    `${n(c.totalAmount)}`,
    "",
    "■ 예금주명",
    isCard ? "- (연구비카드 결제)" : dash(c.vendorHolder),
    "",
    "■ 지급일자",
    dash(c.paymentDueDate),
    "",
    "■ 비고",
    ` - 거래처: ${c.vendor} · 결제수단: ${c.paymentMethod} · 구매(예정)일: ${c.purchaseDate}`,
    " - RCMS 연구비 사용등록 후 거래명세서·세금계산서(또는 카드매출전표)·검수확인서를 증빙으로 첨부 예정",
    " - 본 품의는 flex 전자결재로 승인 (별도 인장·서명 생략)",
    "",
    "■ 첨부파일 (flex 에는 견적서만)",
    ...files,
  ].join("\n");
}
