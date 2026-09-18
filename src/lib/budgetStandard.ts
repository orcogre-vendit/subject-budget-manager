// 표준 비목 분류 — 「국가연구개발사업 연구개발비 사용 기준」(고시)의 비목·사용용도를 앱의 3단계(비목 > 세목 > 세세목)로 정리.
// seed(prisma/seed.ts)·직접비 판정(src/lib/budget.ts)·레거시 정리가 함께 쓰는 순수 데이터 (import 없음).
// 영리기관(중소기업) 과제 기준이라 학생인건비·보안수당·국제공동연구개발비·연구개발부담비·해외 연구자 유치 지원비·
// 종합사업관리비·연구인프라 조성비는 넣지 않았다. 세목 이름은 고시 표기를 따르고, RCMS 가져오기·사용자 입력은
// normalizeCategoryName 으로 띄어쓰기·가운뎃점 차이를 무시하고 기존 항목에 맞춘다(src/lib/categories.ts).
// 근거: docs/연구개발비-사용기준-핵심요약.md 4장.

export type StandardSub = { name: string; details?: string[] };
export type StandardItem = { item: string; direct: boolean; subs: StandardSub[] };

export const STANDARD_TREE: StandardItem[] = [
  {
    item: "인건비",
    direct: true,
    subs: [{ name: "내부인건비(현금)" }, { name: "내부인건비(현물)" }, { name: "외부인건비(현금)" }, { name: "외부인건비(현물)" }],
  },
  {
    item: "연구시설·장비비",
    direct: true,
    subs: [{ name: "연구시설·장비 구입·설치비" }, { name: "연구시설·장비 임차비" }, { name: "연구시설·장비 운영·유지비" }],
  },
  {
    item: "연구재료비",
    direct: true,
    subs: [{ name: "연구재료 구입비" }, { name: "연구개발과제 관리비" }, { name: "연구재료 제작비" }],
  },
  {
    item: "연구활동비",
    direct: true,
    subs: [
      { name: "지식재산 창출 활동비" },
      { name: "외부 전문기술 활용비", details: ["기술도입비", "전문가활용비", "연구개발서비스 활용비"] },
      { name: "회의비", details: ["회의비 식비", "회의·세미나 개최비", "회의장 임차료", "속기·통역료"] },
      { name: "출장비", details: ["국내출장", "국외출장"] },
      { name: "소프트웨어 활용비" },
      { name: "클라우드컴퓨팅서비스 활용비" },
      { name: "연구실운영비", details: ["사무용 기기·소프트웨어", "사무용품비", "냉난방·환경유지"] },
      { name: "연구인력 지원비", details: ["교육·훈련비", "학회·세미나 참가비", "야근·특근 식대"] },
      {
        name: "그 밖의 비용",
        details: ["문헌구입비", "논문게재료", "인쇄·복사·인화비", "세금·공과금", "우편·택배비", "수수료", "공공요금", "일용직 활용비"],
      },
    ],
  },
  { item: "연구수당", direct: true, subs: [{ name: "연구수당" }] },
  { item: "위탁연구개발비", direct: true, subs: [] },
  {
    item: "간접비",
    direct: false,
    subs: [
      // 협약(TIPA)에 잡힌 항목을 앞에, 고시 사용용도를 뒤에
      { name: "위탁정산수수료" },
      { name: "기술임치비" },
      { name: "지식재산권 출원·등록비" },
      { name: "연구지원인력 인건비" },
      { name: "연구개발능률성과급" },
      { name: "기관 공통 비용" },
      { name: "연구실안전관리비" },
      { name: "연구보안관리비" },
      { name: "연구윤리활동비" },
      { name: "과학문화활동비" },
    ],
  },
];

export const DIRECT_COST_ITEM_NAMES: string[] = STANDARD_TREE.filter((i) => i.direct).map((i) => i.item);

/** 이름 비교용 정규화 — NFC, 공백 제거, 가운뎃점 변형(ㆍ ・ ･ ‧ ∙ ⋅)을 '·' 로 통일 */
export function normalizeCategoryName(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFC")
    .replace(/[ㆍ・･‧∙⋅]/g, "·")
    .replace(/\s+/g, "");
}

export const sameCategoryName = (a: string | null | undefined, b: string | null | undefined): boolean =>
  normalizeCategoryName(a) === normalizeCategoryName(b);

// ── 레거시 분류 (MS Access 시절 + 구 RCMS 표기) ──────────────────────────────
// seed 가 거래를 표준 분류로 옮긴 뒤, 참조가 남지 않은 항목만 지운다. 사용자가 새로 만든 세목·세세목은 건드리지 않는다.

/** 거래 이동 규칙. from 은 [비목, 세목?] (세목이 없으면 그 비목의 나머지 전부), to 는 [비목, 세목?, 세세목?].
 *  구체적인 규칙을 앞에 두고 비목 단위 폴백을 뒤에 둔다 (첫 매치 사용). to 에 세세목이 없고 from 에 세목이 있으면
 *  거래의 세세목(레거시 목록에 없는 것)은 새 세목 아래로 그대로 옮긴다. */
export const LEGACY_REMAP: { from: [string, string?]; to: [string, string?, string?] }[] = [
  { from: ["연구장비·재료비", "재료비"], to: ["연구재료비", "연구재료 구입비"] },
  { from: ["연구장비·재료비", "시약·재료구입비및전산처리·관리비"], to: ["연구재료비", "연구재료 구입비"] },
  { from: ["연구장비·재료비", "시작품 제작비"], to: ["연구재료비", "연구재료 제작비"] },
  { from: ["연구장비·재료비", "시험 성적서 수수료"], to: ["연구활동비", "외부 전문기술 활용비", "연구개발서비스 활용비"] },
  { from: ["연구장비·재료비"], to: ["연구재료비"] },
  { from: ["연구과제추진비", "국내여비"], to: ["연구활동비", "출장비", "국내출장"] },
  { from: ["연구과제추진비", "회의비"], to: ["연구활동비", "회의비"] },
  { from: ["연구과제추진비", "식대"], to: ["연구활동비", "회의비", "회의비 식비"] },
  { from: ["연구과제추진비", "사무용품비"], to: ["연구활동비", "연구실운영비", "사무용품비"] },
  { from: ["연구과제추진비"], to: ["연구활동비"] },
  { from: ["연구결과활용", "특허출원비"], to: ["간접비", "지식재산권 출원·등록비"] },
  { from: ["연구결과활용"], to: ["간접비"] },
  { from: ["연구활동비", "논문게재료"], to: ["연구활동비", "그 밖의 비용", "논문게재료"] },
  { from: ["연구활동비", "국외여비"], to: ["연구활동비", "출장비", "국외출장"] },
  { from: ["연구활동비", "학회세미나참가"], to: ["연구활동비", "연구인력 지원비", "학회·세미나 참가비"] },
  { from: ["연구활동비", "세미나개최비"], to: ["연구활동비", "회의비", "회의·세미나 개최비"] },
  { from: ["연구활동비", "도서구입비"], to: ["연구활동비", "그 밖의 비용", "문헌구입비"] },
  { from: ["연구활동비", "전문가활용비"], to: ["연구활동비", "외부 전문기술 활용비", "전문가활용비"] },
  { from: ["연구활동비", "인쇄및복사비"], to: ["연구활동비", "그 밖의 비용", "인쇄·복사·인화비"] },
  { from: ["연구재료비", "연구과제 관리비"], to: ["연구재료비", "연구개발과제 관리비"] },
  { from: ["인건비", "내부인건비"], to: ["인건비", "내부인건비(현금)"] },
  { from: ["인건비", "사회보험료"], to: ["인건비", "내부인건비(현금)"] },
];

/** 세목은 그대로 두고 세세목 이름만 바꾸는 규칙 (띄어쓰기·가운뎃점만 다른 옛 표기는 규칙이 필요 없다 — seed 가 표준 표기로 이름을 고친다) */
export const LEGACY_DETAIL_REMAP: { item: string; sub: string; from: string; to: string }[] = [];

/**
 * 표준 트리에 있는 이름인지 (정규화 비교) — 레거시 정리에서 표준 항목을 지우지 않게 지키는 용도.
 * parent 는 세목이면 비목명, 세세목이면 세목명: 같은 이름이라도 다른 부모 아래(예: 연구과제추진비 > 회의비)면 표준이 아니다.
 */
export function isStandardName(kind: "item" | "sub" | "detail", name: string, parent?: string): boolean {
  for (const i of STANDARD_TREE) {
    if (kind === "item") {
      if (sameCategoryName(i.item, name)) return true;
      continue;
    }
    if (kind === "sub" && parent !== undefined && !sameCategoryName(i.item, parent)) continue;
    for (const s of i.subs) {
      if (kind === "sub" && sameCategoryName(s.name, name)) return true;
      if (kind === "detail" && (parent === undefined || sameCategoryName(s.name, parent)) && (s.details ?? []).some((d) => sameCategoryName(d, name)))
        return true;
    }
  }
  return false;
}

/** 참조가 없으면 지우는 레거시 비목 */
export const LEGACY_ITEMS = ["연구장비·재료비", "연구과제추진비", "연구결과활용"];

/** 참조가 없으면 지우는 레거시 세목 [비목, 세목] */
export const LEGACY_SUBS: [string, string][] = [
  ["연구장비·재료비", "시작품 제작비"],
  ["연구장비·재료비", "재료비"],
  ["연구장비·재료비", "시약·재료구입비및전산처리·관리비"],
  ["연구장비·재료비", "시험 성적서 수수료"],
  ["연구과제추진비", "국내여비"],
  ["연구과제추진비", "회의비"],
  ["연구과제추진비", "식대"],
  ["연구과제추진비", "사무용품비"],
  ["연구결과활용", "특허출원비"],
  ["연구활동비", "논문게재료"],
  ["연구활동비", "국외여비"],
  ["연구활동비", "학회세미나참가"],
  ["연구활동비", "세미나개최비"],
  ["연구활동비", "도서구입비"],
  ["연구활동비", "전문가활용비"],
  ["연구활동비", "인쇄및복사비"],
  ["연구재료비", "연구과제 관리비"],
  ["인건비", "내부인건비"],
  ["인건비", "사회보험료"],
];

/** 참조가 없으면 지우는 레거시 세세목 이름 (어느 세목 아래든) */
export const LEGACY_DETAILS = [
  "관내출장",
  "국내여비",
  "국외여비",
  "항공운임비",
  "기타소모품및케이블류",
  "음향취득모듈",
  "DSP모듈",
  "학회세미나참가",
  "다과비",
  "회의비",
  "시약 및 재료비",
  "프린트 토너",
  "제본비",
];
