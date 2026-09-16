// 기준정보 seed — 정부 R&D 비목/세목/세세목 표준 분류 (레거시 Access에서 추출)
import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

// 비목 (대분류)
const BUDGET_ITEMS = [
  "연구장비·재료비",
  "연구활동비",
  "연구과제추진비",
  "연구수당",
  "인건비",
  "연구결과활용",
  "간접비",
  "연구재료비",
  "위탁연구개발비",
];

// 세목 (중분류): [세목명, 소속 비목]
const SUB_ITEMS: [string, string][] = [
  ["논문게재료", "연구활동비"],
  ["연구수당", "연구수당"],
  ["시작품 제작비", "연구장비·재료비"],
  ["내부인건비", "인건비"],
  ["사회보험료", "인건비"],
  ["특허출원비", "연구결과활용"],
  ["국내여비", "연구과제추진비"],
  ["국외여비", "연구활동비"],
  ["재료비", "연구장비·재료비"],
  ["학회세미나참가", "연구활동비"],
  ["회의비", "연구과제추진비"],
  ["세미나개최비", "연구활동비"],
  ["식대", "연구과제추진비"],
  ["사무용품비", "연구과제추진비"],
  ["도서구입비", "연구활동비"],
  ["전문가활용비", "연구활동비"],
  ["인쇄및복사비", "연구활동비"],
  ["시약·재료구입비및전산처리·관리비", "연구장비·재료비"],
  ["시험 성적서 수수료", "연구장비·재료비"],
];

// 세세목 (소분류): [세세목명, 소속 세목]
const DETAIL_ITEMS: [string, string][] = [
  ["관내출장", "국내여비"],
  ["국내여비", "국내여비"],
  ["국외여비", "국외여비"],
  ["항공운임비", "국외여비"],
  ["기타소모품및케이블류", "재료비"],
  ["음향취득모듈", "재료비"],
  ["DSP모듈", "재료비"],
  ["학회세미나참가", "학회세미나참가"],
  ["다과비", "회의비"],
  ["회의비", "회의비"],
  ["시약 및 재료비", "재료비"],
  ["프린트 토너", "사무용품비"],
  ["제본비", "인쇄및복사비"],
];

// ── 정부 R&D(중기부·TIPA, RCMS) 비목 3단계 ─────────────────────────────
// 앱은 비목/세목/세세목 3단계라 "직접비" 상위 묶음은 코드(src/lib/budget)에서 다룬다.
// 세목·세세목은 (비목,세목) 쌍으로 정확히 연결 (세목명은 비목 간 중복 가능: 예 회의비)
const RCMS_TREE: { item: string; subs: { name: string; details?: string[] }[] }[] = [
  { item: "인건비", subs: [{ name: "내부인건비(현금)" }, { name: "내부인건비(현물)" }] },
  {
    item: "연구재료비",
    subs: [{ name: "연구재료 구입비" }, { name: "연구과제 관리비" }, { name: "연구재료 제작비" }],
  },
  {
    item: "연구활동비",
    subs: [
      { name: "외부 전문기술 활용비", details: ["기술도입비", "전문가활용비", "연구개발서비스활용비"] },
      { name: "클라우드컴퓨팅서비스 활용비" },
      { name: "지식재산 창출 활동비" },
      { name: "회의비" },
      { name: "출장비" },
      { name: "소프트웨어 활용비" },
      { name: "연구실 운영비" },
      { name: "연구인력 지원비" },
      { name: "그 밖의 비용" },
    ],
  },
  {
    item: "간접비",
    subs: [{ name: "위탁정산수수료" }, { name: "기술임치비" }, { name: "지식재산권 출원·등록비" }],
  },
  { item: "위탁연구개발비", subs: [] },
];

// ── 세목별 필수 증빙 요건 ─────────────────────────────────────────────
type Req = "required" | "one_of" | "optional";
type EvReq = { code: string; label: string; requirement: Req; groupKey?: string };
const req = (code: string, label: string): EvReq => ({ code, label, requirement: "required" });
const opt = (code: string, label: string): EvReq => ({ code, label, requirement: "optional" });
const oneOf = (code: string, label: string, groupKey: string): EvReq => ({
  code, label, requirement: "one_of", groupKey,
});

const EVIDENCE: { item: string; sub: string; reqs: EvReq[] }[] = [
  {
    item: "연구재료비", sub: "연구재료 구입비",
    reqs: [
      req("STATEMENT", "거래명세서"),
      req("PURCHASE_REQUEST", "구매의뢰서(품의서)"),
      req("INSPECTION_CERT", "검수(설치)완료확인서"),
      opt("INSPECTION_PHOTO", "검수(납품·설치) 사진"),
      oneOf("TAX_INVOICE", "세금계산서", "receipt"),
      oneOf("CARD_SLIP", "카드매출전표", "receipt"),
      opt("IMPORT_DECL", "수입신고서류"),
      opt("DELIVERY_PROOF", "배달증명"),
      opt("MATERIAL_BREAKDOWN", "재료비 소요내역서"),
      opt("QUOTE", "견적서"),
      opt("CONTRACT", "계약서"),
    ],
  },
  {
    item: "연구활동비", sub: "외부 전문기술 활용비",
    reqs: [
      req("INTERNAL_APPROVAL", "내부결재문서"),
      req("RECEIPT", "집행영수증"),
      opt("ADVISORY_CONFIRM", "자문확인서(전문가활용비)"),
      opt("SERVICE_RESULT", "결과서(연구개발서비스)"),
      opt("TECH_CONTRACT", "기술도입계약서"),
    ],
  },
  {
    item: "연구활동비", sub: "클라우드컴퓨팅서비스 활용비",
    reqs: [
      req("INTERNAL_APPROVAL", "내부결재문서"),
      req("PURCHASE_REQUEST", "구매의뢰서(품의서)"),
      req("STATEMENT", "거래명세서"),
      req("RECEIPT", "집행영수증"),
      req("INSPECTION_CERT", "검수완료확인서"),
      opt("INSPECTION_PHOTO", "검수(납품·설치) 사진"),
      opt("CONTRACT", "계약서"),
      opt("USAGE_REPORT", "월별 사용량 리포트"),
    ],
  },
  {
    item: "연구활동비", sub: "회의비",
    reqs: [
      oneOf("INTERNAL_APPROVAL", "내부결재문서", "meeting_doc"),
      oneOf("MEETING_MINUTES", "회의록", "meeting_doc"),
      req("RECEIPT", "집행영수증"),
      opt("MEETING_SUMMARY", "목적·일시·장소·참석자 자료 (10만원 이하 대체)"),
    ],
  },
  {
    item: "연구활동비", sub: "출장비",
    reqs: [
      req("TRAVEL_REQUEST", "출장신청서"),
      req("RECEIPT", "집행영수증"),
      opt("TRAVEL_POLICY", "여비규정"),
      opt("TRAVEL_REPORT", "출장결과보고서(국외)"),
    ],
  },
  {
    item: "인건비", sub: "내부인건비(현금)",
    reqs: [
      req("PAYSLIP", "급여명세서(월별)"),
      req("TRANSFER_PROOF", "계좌이체증명"),
      req("RESEARCHER_ROSTER", "참여연구자현황표"),
      req("INSURANCE_CERT", "건강보험자격득실확인서(신규채용)"),
      opt("EMPLOYMENT_CONTRACT", "근로계약서"),
    ],
  },
];

async function main() {
  // 비목
  for (let i = 0; i < BUDGET_ITEMS.length; i++) {
    await prisma.budgetItem.upsert({
      where: { name: BUDGET_ITEMS[i] },
      update: { sortOrder: i },
      create: { name: BUDGET_ITEMS[i], sortOrder: i },
    });
  }

  // 세목
  for (const [name, parent] of SUB_ITEMS) {
    const item = await prisma.budgetItem.findUnique({ where: { name: parent } });
    if (!item) throw new Error(`비목 없음: ${parent}`);
    await prisma.budgetSubItem.upsert({
      where: { budgetItemId_name: { budgetItemId: item.id, name } },
      update: {},
      create: { name, budgetItemId: item.id },
    });
  }

  // 세세목 — 세목명이 여러 비목에 걸칠 수 있으나 현 데이터는 유일. 첫 매칭에 연결.
  for (const [name, parentSub] of DETAIL_ITEMS) {
    const sub = await prisma.budgetSubItem.findFirst({
      where: { name: parentSub },
    });
    if (!sub) {
      console.warn(`세목 없음(세세목 ${name} 건너뜀): ${parentSub}`);
      continue;
    }
    await prisma.budgetDetailItem.upsert({
      where: { budgetSubItemId_name: { budgetSubItemId: sub.id, name } },
      update: {},
      create: { name, budgetSubItemId: sub.id },
    });
  }

  // RCMS 3단계 — (비목,세목) 쌍으로 정확 연결 (중복 방지: upsert)
  for (const { item, subs } of RCMS_TREE) {
    const bi = await prisma.budgetItem.findUnique({ where: { name: item } });
    if (!bi) throw new Error(`비목 없음: ${item}`);
    for (const s of subs) {
      const sub = await prisma.budgetSubItem.upsert({
        where: { budgetItemId_name: { budgetItemId: bi.id, name: s.name } },
        update: {},
        create: { budgetItemId: bi.id, name: s.name },
      });
      for (const d of s.details ?? []) {
        await prisma.budgetDetailItem.upsert({
          where: { budgetSubItemId_name: { budgetSubItemId: sub.id, name: d } },
          update: {},
          create: { budgetSubItemId: sub.id, name: d },
        });
      }
    }
  }

  // 세목별 필수 증빙 요건
  for (const { item, sub, reqs } of EVIDENCE) {
    const bi = await prisma.budgetItem.findUnique({ where: { name: item } });
    if (!bi) continue;
    const bs = await prisma.budgetSubItem.findUnique({
      where: { budgetItemId_name: { budgetItemId: bi.id, name: sub } },
    });
    if (!bs) continue;
    for (let i = 0; i < reqs.length; i++) {
      const r = reqs[i];
      const data = {
        label: r.label,
        requirement: r.requirement,
        groupKey: r.groupKey ?? null,
        sortOrder: i,
      };
      await prisma.evidenceRequirement.upsert({
        where: { budgetSubItemId_code: { budgetSubItemId: bs.id, code: r.code } },
        update: data,
        create: { budgetSubItemId: bs.id, code: r.code, ...data },
      });
    }
  }

  const [bi, si, di, ev] = await Promise.all([
    prisma.budgetItem.count(),
    prisma.budgetSubItem.count(),
    prisma.budgetDetailItem.count(),
    prisma.evidenceRequirement.count(),
  ]);
  console.log(`Seed 완료 — 비목 ${bi}, 세목 ${si}, 세세목 ${di}, 증빙요건 ${ev}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
