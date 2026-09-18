// 서류 템플릿이 소비하는 문맥 — 서버 액션이 Prisma 데이터로 조립한다.
// 날짜는 "YYYY-MM-DD" 문자열(없으면 "-"), 금액은 정수(원).

export type DocItem = {
  name: string;
  spec: string;
  quantity: number;
  unitPrice: string; // 십진 문자열(소수 2자리까지) — 표시는 fmtUnitPrice
  amount: number;
};

/** 검수확인서에 삽입할 사진 — data 가 없으면 PDF 에 넣을 수 없는 형식(파일명만 표기) */
export type DocPhoto = {
  caption: string;
  data: Buffer | null;
};

export type DocContext = {
  project: { code: string; name: string; short: string };
  budgetPath: string; // 예: 직접비 > 연구재료비 > 연구재료 구입비
  subItemName: string;
  items: DocItem[];
  itemSummary: string; // 예: "노트북 외 2건"

  supplyAmount: number; // 공급가액 (연구비)
  vatAmount: number; // 부가세 (회사 자금)
  totalAmount: number;

  purpose: string;
  vendor: string;
  vendorBank: string;
  vendorAccount: string;
  vendorHolder: string;
  paymentMethod: string; // 연구비카드 | RCMS 계좌이체
  purchaseDate: string;
  invoiceDate: string;
  deliveryDate: string;
  inspectionDate: string;
  installLocation: string; // 설치(납품)장소
  paymentDueDate: string;

  requester: string;
  inspector: string;
  contact: string;

  today: string;
  yy: string; // "26"
  m: string; // "9"

  evidenceType: string; // RCMS 증빙 유형 (예: 전자세금계산서)
  evidenceLookup: string; // RCMS 증빙 조회 안내

  photos: DocPhoto[]; // 검수 사진 (evidenceCode=INSPECTION_PHOTO 첨부)
  attachments: { name: string; code: string | null }[]; // 첨부된 증빙 전체 (품의서 첨부파일 목록용)
};

/** 원 단위 콤마 표기 */
export const n = (v: number): string => v.toLocaleString("ko-KR");
