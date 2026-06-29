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

  const [bi, si, di] = await Promise.all([
    prisma.budgetItem.count(),
    prisma.budgetSubItem.count(),
    prisma.budgetDetailItem.count(),
  ]);
  console.log(`Seed 완료 — 비목 ${bi}, 세목 ${si}, 세세목 ${di}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
