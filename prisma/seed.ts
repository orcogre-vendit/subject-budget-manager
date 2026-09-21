// 기준정보 seed — 표준 비목/세목/세세목(src/lib/budgetStandard.ts)과 세목별 증빙 요건을 넣고,
// 레거시(Access 시절·구 표기) 분류에 걸린 거래를 표준 분류로 옮긴 뒤 참조가 남지 않은 레거시 항목을 지운다.
// 매번 실행해도 안전(upsert·조건부 삭제). 컨테이너 엔트리포인트가 시작 때마다 돌린다.
import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  LEGACY_DETAILS,
  LEGACY_DETAIL_REMAP,
  LEGACY_ITEMS,
  LEGACY_REMAP,
  LEGACY_SUBS,
  STANDARD_TREE,
  isStandardName,
  sameCategoryName,
} from "../src/lib/budgetStandard";
import { findItem, findOrCreateDetail, findOrCreateItem, findOrCreateSub, findSub } from "../src/lib/categories";
import { renameAttachmentsFor } from "../src/lib/attachmentNames";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

// ── 세목별 증빙 요건 (매뉴얼 표 3-12·3-14·3-15·3-17·3-18·3-23 기준, docs/연구개발비-사용기준-핵심요약.md 4장) ──
type Req = "required" | "one_of" | "optional";
type EvReq = { code: string; label: string; requirement: Req; groupKey?: string };
const req = (code: string, label: string): EvReq => ({ code, label, requirement: "required" });
const opt = (code: string, label: string): EvReq => ({ code, label, requirement: "optional" });
const oneOf = (code: string, label: string, groupKey: string): EvReq => ({
  code, label, requirement: "one_of", groupKey,
});

/** 물품 구매형 세목 공통(재료·장비·제작): 구매의뢰서=내부결재문서, 전표 택1, 거래명세서, 검수확인서 */
const purchaseReqs = (extra: EvReq[] = []): EvReq[] => [
  req("PURCHASE_REQUEST", "구매의뢰서(품의서 — 견적서가 아닌 내부결재문서)"),
  oneOf("TAX_INVOICE", "세금계산서", "receipt"),
  oneOf("CARD_SLIP", "카드매출전표", "receipt"),
  req("STATEMENT", "거래명세서"),
  req("INSPECTION_CERT", "검수(설치)완료확인서"),
  opt("INSPECTION_PHOTO", "검수(납품·설치) 사진"),
  opt("QUOTE", "견적서"),
  opt("CONTRACT", "계약서(계약 거래 시)"),
  ...extra,
];
/** 간접비 세목 공통(영리기관 표 3-23): 전표 + 품의서·구매의뢰서 등 관련 문서 */
const indirectReqs: EvReq[] = [
  req("RECEIPT", "집행영수증(카드매출전표·계좌이체증명 + 세금계산서)"),
  opt("INTERNAL_APPROVAL", "품의서·구매의뢰서 등 관련 문서"),
];

const EVIDENCE: { item: string; sub: string; reqs: EvReq[] }[] = [
  {
    item: "인건비", sub: "내부인건비(현금)",
    reqs: [
      req("RESEARCHER_ROSTER", "참여연구자현황표"),
      req("PAYSLIP", "급여명세서(월별)"),
      req("TRANSFER_PROOF", "계좌이체증명"),
      req("CASH_PAY_PLAN", "영리기관 현금계상 인건비 관리계획·현황(별지 3호)"),
      opt("INSURANCE_CERT", "건강보험자격득실확인서(신규채용 시 필수)"),
      opt("EMPLOYMENT_CONTRACT", "근로계약서"),
    ],
  },
  {
    item: "인건비", sub: "내부인건비(현물)",
    reqs: [req("RESEARCHER_ROSTER", "참여연구자현황표"), req("PAYSLIP", "급여명세서(월별)")],
  },
  {
    item: "연구시설·장비비", sub: "연구시설·장비 구입·설치비",
    reqs: purchaseReqs([
      opt("IMPORT_DECL", "수입신고서류(외자구매)"),
      opt("EQUIP_REGISTRY", "국가연구시설장비등록증(해당 장비)"),
      opt("EQUIP_REVIEW", "장비심의 공문(3천만원 이상)"),
    ]),
  },
  {
    item: "연구재료비", sub: "연구재료 구입비",
    reqs: purchaseReqs([
      opt("IMPORT_DECL", "수입신고서류(외자구매)"),
      opt("DELIVERY_PROOF", "배달증명(수입신고 불요 물품)"),
      opt("MATERIAL_BREAKDOWN", "재료비 소요내역서"),
    ]),
  },
  {
    item: "연구재료비", sub: "연구재료 제작비",
    reqs: purchaseReqs([
      opt("MATERIAL_BREAKDOWN", "재료비 소요내역서(내부제작)"),
      opt("PURCHASE_ORDER", "내부기안문·발주서(외부제작, 사양·납기 포함)"),
    ]),
  },
  {
    item: "연구활동비", sub: "지식재산 창출 활동비",
    reqs: [
      req("INTERNAL_APPROVAL", "내부결재문서"),
      req("RECEIPT", "집행영수증(카드매출전표·계좌이체증명 + 세금계산서)"),
      req("IP_REPORT", "지식재산 창출 결과보고서"),
      opt("CONTRACT", "계약서·과업지시서(계약 시)"),
    ],
  },
  {
    item: "연구활동비", sub: "외부 전문기술 활용비",
    reqs: [
      req("INTERNAL_APPROVAL", "내부결재문서(전문가 인적사항 첨부)"),
      req("RECEIPT", "집행영수증(카드매출전표·계좌이체증명)"),
      opt("ADVISORY_CONFIRM", "자문확인서(전문가활용비)"),
      opt("SERVICE_REQUEST", "시험·분석 의뢰서(연구개발서비스)"),
      opt("SERVICE_RESULT", "결과서(연구개발서비스)"),
      opt("TECH_CONTRACT", "기술도입계약서(기술도입비)"),
    ],
  },
  {
    item: "연구활동비", sub: "회의비",
    reqs: [
      req("INTERNAL_APPROVAL", "사전 내부결재문서(식비는 필수, 연구책임자 결재선 포함)"),
      req("RECEIPT", "집행영수증(카드매출전표·계좌이체증명)"),
      opt("MEETING_MINUTES", "회의록(사전결재와 실제가 같으면 생략 가능)"),
      opt("MEETING_SUMMARY", "목적·일시·장소·참석자 자료(10만원 이하 대체)"),
    ],
  },
  {
    item: "연구활동비", sub: "출장비",
    reqs: [
      req("TRAVEL_REQUEST", "출장신청서(내부품의서로 갈음 가능)"),
      req("TRAVEL_PROOF", "출장 증명 서류(여비산출내역·일정)"),
      req("RECEIPT", "집행영수증(카드매출전표·계좌이체증명)"),
      opt("TRAVEL_REPORT", "출장결과보고서(국외 출장은 필수)"),
      opt("TRAVEL_POLICY", "여비규정"),
    ],
  },
  {
    item: "연구활동비", sub: "소프트웨어 활용비",
    reqs: [
      req("INTERNAL_APPROVAL", "내부결재문서"),
      req("PURCHASE_REQUEST", "구매의뢰서(품의서)"),
      req("STATEMENT", "거래명세서(사용계약기간 확인 가능)"),
      req("RECEIPT", "집행영수증(카드매출전표·계좌이체증명 + 세금계산서)"),
      req("INSPECTION_CERT", "검수(설치)완료확인서"),
      opt("INSPECTION_PHOTO", "검수 화면 캡처·사진"),
      opt("CONTRACT", "계약서(계약 거래 시)"),
    ],
  },
  {
    item: "연구활동비", sub: "클라우드컴퓨팅서비스 활용비",
    reqs: [
      req("INTERNAL_APPROVAL", "내부결재문서"),
      req("PURCHASE_REQUEST", "구매의뢰서(품의서)"),
      req("STATEMENT", "거래명세서"),
      req("RECEIPT", "집행영수증(카드매출전표·계좌이체증명 + 세금계산서)"),
      req("INSPECTION_CERT", "검수완료확인서"),
      opt("INSPECTION_PHOTO", "검수 화면 캡처·사진"),
      opt("CONTRACT", "계약서(계약 거래 시)"),
      opt("USAGE_REPORT", "월별 사용량 리포트"),
    ],
  },
  {
    item: "연구활동비", sub: "연구실운영비",
    reqs: [
      req("RECEIPT", "집행영수증(카드매출전표·계좌이체증명 + 세금계산서)"),
      req("STATEMENT", "거래명세서"),
      opt("PURCHASE_REQUEST", "구매의뢰서(기기·소프트웨어 구입 시)"),
      opt("INSPECTION_CERT", "검수(설치)완료확인서(기기·소프트웨어 구입 시)"),
      opt("LAB_PLAN", "연구실운영비 활용·관리계획(별지 4호, 사무용품비 외)"),
    ],
  },
  {
    item: "연구활동비", sub: "연구인력 지원비",
    reqs: [
      req("RECEIPT", "집행영수증(카드매출전표·계좌이체증명 + 세금계산서)"),
      opt("INTERNAL_APPROVAL", "내부결재문서(교육·훈련은 필수, 참가자 성명 포함)"),
      opt("TRAINING_CERT", "교육 수료증·수납영수증"),
      opt("CONFERENCE_PROOF", "학회 참가 확인자료(등록영수증·명찰)"),
      opt("OVERTIME_PROOF", "초과근무 내역(야근·특근 식대)"),
    ],
  },
  {
    item: "연구활동비", sub: "그 밖의 비용",
    reqs: [
      req("RECEIPT", "집행영수증(카드매출전표·계좌이체증명 + 세금계산서)"),
      opt("STATEMENT", "거래명세서(문헌은 도서명·권수)"),
      opt("PAPER_INFO", "논문 정보(논문게재료)"),
      opt("INTERNAL_APPROVAL", "내부결재문서(일용직 활용 시)"),
      opt("WORKER_CONFIRM", "일용직 활용 확인서"),
    ],
  },
  {
    item: "연구수당", sub: "연구수당",
    reqs: [
      req("CONTRIB_EVAL", "기여도 평가서류(평가계획·결과)"),
      req("PAY_REQUEST", "지급신청서"),
      req("TRANSFER_PROOF", "계좌이체증명"),
    ],
  },
  ...STANDARD_TREE.find((i) => i.item === "간접비")!.subs.map((s) => ({ item: "간접비", sub: s.name, reqs: indirectReqs })),
];

/** 정규화로 찾은 행의 표기가 표준과 다르면("연구실 운영비" → "연구실운영비") 표준 표기로 고친다. 같은 이름이 이미 있으면 그대로 둔다 */
async function renameIfDiffers(kind: "item" | "sub" | "detail", row: { id: number; name: string }, standard: string) {
  if (row.name === standard) return;
  try {
    if (kind === "item") await prisma.budgetItem.update({ where: { id: row.id }, data: { name: standard } });
    else if (kind === "sub") await prisma.budgetSubItem.update({ where: { id: row.id }, data: { name: standard } });
    else await prisma.budgetDetailItem.update({ where: { id: row.id }, data: { name: standard } });
    console.log(`  표기 정리: ${row.name} → ${standard}`);
  } catch {
    console.warn(`  표기 정리 건너뜀(같은 이름 존재): ${row.name} → ${standard}`);
  }
}

/** 표준 트리 upsert — 비목 순서(sortOrder)와 세목·세세목을 이름 정규화로 찾아 없으면 만들고, 표기가 다르면 고친다 */
async function seedStandardTree() {
  for (let i = 0; i < STANDARD_TREE.length; i++) {
    const { item, subs } = STANDARD_TREE[i];
    const bi = await findOrCreateItem(prisma, item, i);
    await renameIfDiffers("item", bi, item);
    await prisma.budgetItem.update({ where: { id: bi.id }, data: { sortOrder: i } });
    for (const s of subs) {
      const sub = await findOrCreateSub(prisma, bi.id, s.name);
      await renameIfDiffers("sub", sub, s.name);
      for (const d of s.details ?? []) {
        const det = await findOrCreateDetail(prisma, sub.id, d);
        await renameIfDiffers("detail", det, d);
      }
    }
  }
}

async function seedEvidence() {
  for (const { item, sub, reqs } of EVIDENCE) {
    const bi = await findItem(prisma, item);
    if (!bi) continue;
    const bs = await findSub(prisma, bi.id, sub);
    if (!bs) continue;
    for (let i = 0; i < reqs.length; i++) {
      const r = reqs[i];
      const data = { label: r.label, requirement: r.requirement, groupKey: r.groupKey ?? null, sortOrder: i };
      await prisma.evidenceRequirement.upsert({
        where: { budgetSubItemId_code: { budgetSubItemId: bs.id, code: r.code } },
        update: data,
        create: { budgetSubItemId: bs.id, code: r.code, ...data },
      });
    }
  }
}

/** 레거시 분류의 거래를 표준 분류로 옮기고, 참조가 남지 않은 레거시 항목을 지운다 */
async function retireLegacy() {
  const txs = await prisma.transaction.findMany({
    where: { budgetItemId: { not: null } },
    select: {
      id: true,
      budgetItem: { select: { name: true } },
      budgetSubItem: { select: { name: true } },
      budgetDetailItem: { select: { name: true } },
    },
  });
  let moved = 0;
  for (const t of txs) {
    const item = t.budgetItem?.name ?? "";
    const sub = t.budgetSubItem?.name ?? null;
    const detail = t.budgetDetailItem?.name ?? null;
    const rule = LEGACY_REMAP.find(
      (r) => sameCategoryName(r.from[0], item) && (r.from[1] === undefined || (sub !== null && sameCategoryName(r.from[1], sub))),
    );
    let target: { item: string; sub: string | null; detail: string | null } | null = null;
    if (rule) {
      const carry =
        rule.from[1] !== undefined && rule.to[2] === undefined && detail && !LEGACY_DETAILS.some((d) => sameCategoryName(d, detail))
          ? detail
          : null;
      target = { item: rule.to[0], sub: rule.to[1] ?? null, detail: rule.to[2] ?? carry };
    } else if (sub && detail) {
      const dr = LEGACY_DETAIL_REMAP.find(
        (r) => sameCategoryName(r.item, item) && sameCategoryName(r.sub, sub) && sameCategoryName(r.from, detail),
      );
      if (dr) target = { item, sub, detail: dr.to };
    }
    if (!target) continue;
    const bi = await findOrCreateItem(prisma, target.item);
    const s = target.sub ? await findOrCreateSub(prisma, bi.id, target.sub) : null;
    const d = s && target.detail ? await findOrCreateDetail(prisma, s.id, target.detail) : null;
    await prisma.transaction.update({
      where: { id: t.id },
      data: { budgetItemId: bi.id, budgetSubItemId: s?.id ?? null, budgetDetailItemId: d?.id ?? null },
    });
    const renamed = await renameAttachmentsFor(prisma, t.id); // 파일명 규칙의 비목 부분을 새 비목으로
    console.log(
      `  거래 #${t.id}: ${[item, sub, detail].filter(Boolean).join(" > ")} → ${[target.item, target.sub, target.detail].filter(Boolean).join(" > ")}${renamed ? ` (첨부 이름 ${renamed}건 갱신)` : ""}`,
    );
    moved++;
  }

  // 세세목 → 세목 → 비목 순으로, 거래가 참조하지 않는 레거시 항목만 삭제. 표준 이름과 같은 항목은 절대 지우지 않는다
  const staleDetails = await prisma.budgetDetailItem.findMany({
    where: { name: { in: LEGACY_DETAILS }, transactions: { none: {} } },
    select: { id: true, name: true, budgetSubItem: { select: { name: true } } },
  });
  const detailIds = staleDetails.filter((d) => !isStandardName("detail", d.name, d.budgetSubItem.name)).map((d) => d.id);
  let delDetails = detailIds.length;
  if (detailIds.length) await prisma.budgetDetailItem.deleteMany({ where: { id: { in: detailIds } } });

  let delSubs = 0;
  for (const [itemName, subName] of LEGACY_SUBS) {
    if (isStandardName("sub", subName, itemName)) continue;
    const bi = await findItem(prisma, itemName);
    if (!bi) continue;
    const s = await findSub(prisma, bi.id, subName);
    if (!s) continue;
    // 거래를 옮긴 뒤 레거시 세목에 남은 세세목은 전부 고아 — 거래 참조가 없으면 함께 지운다
    const orphanDetails = await prisma.budgetDetailItem.findMany({
      where: { budgetSubItemId: s.id, transactions: { none: {} } },
      select: { id: true },
    });
    if (orphanDetails.length) {
      await prisma.budgetDetailItem.deleteMany({ where: { id: { in: orphanDetails.map((d) => d.id) } } });
      delDetails += orphanDetails.length;
    }
    const used = await prisma.transaction.count({ where: { budgetSubItemId: s.id } });
    const details = await prisma.budgetDetailItem.count({ where: { budgetSubItemId: s.id } });
    if (used === 0 && details === 0) {
      await prisma.budgetSubItem.delete({ where: { id: s.id } }); // 증빙 요건은 cascade
      delSubs++;
    } else {
      console.warn(`  세목 유지(거래 ${used}건, 세세목 ${details}개): ${itemName} > ${subName}`);
    }
  }

  let delItems = 0;
  for (const name of LEGACY_ITEMS) {
    if (isStandardName("item", name)) continue;
    const bi = await findItem(prisma, name);
    if (!bi) continue;
    const used = await prisma.transaction.count({ where: { budgetItemId: bi.id } });
    const subs = await prisma.budgetSubItem.count({ where: { budgetItemId: bi.id } });
    if (used === 0 && subs === 0) {
      await prisma.budgetItem.delete({ where: { id: bi.id } });
      delItems++;
    } else {
      console.warn(`  비목 유지(거래 ${used}건, 세목 ${subs}개): ${name}`);
    }
  }
  console.log(`레거시 정리 — 거래 이동 ${moved}건, 세세목 삭제 ${delDetails}, 세목 삭제 ${delSubs}, 비목 삭제 ${delItems}`);
}

/** 첨부 표시 이름을 규칙과 대조해 어긋난 것만 고친다 — 분류 이동·거래처 변경이 언제 있었든 항상 규칙과 일치시킨다 */
async function syncAttachmentNames() {
  const txs = await prisma.transaction.findMany({ where: { attachments: { some: {} } }, select: { id: true } });
  let changed = 0;
  for (const t of txs) changed += await renameAttachmentsFor(prisma, t.id);
  if (changed) console.log(`첨부 이름 규칙 동기화 — ${changed}건 갱신`);
}

async function main() {
  await seedStandardTree();
  await seedEvidence();
  await retireLegacy();
  await syncAttachmentNames();

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
