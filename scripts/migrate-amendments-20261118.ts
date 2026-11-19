// v1.8.0 이전에 스크립트로 넣은 협약변경 조정 레코드를 협약변경 기록(BudgetAmendment)으로 묶는다.
// 조정 레코드는 고치지 않고 amendmentId 만 연결한다. 변경 전/후는 장부에서 계산(최초 편성 → 조정 순서대로 누적).
// 사용: tsx scripts/migrate-amendments-20261118.ts [--apply]   (기본은 dry-run). 이미 있으면 건너뛴다(여러 번 돌려도 안전).
import "dotenv/config";
import { createPrisma } from "../src/lib/db";
import { lineKey } from "../src/lib/amendment";

const PROJECT_CODE = "RS-2026-25583687";
const YEAR_NO = 1;
/** 시간순. offLedger: 장부(현금 원장)에 없는 줄 — 대비표 기록용 (첨부3 대비표 기준) */
const PLANS = [
  { label: "최초 편성 세목 배분", reason: "최초 협약 편성의 연구활동비 공통 금액을 세목(외부 전문기술 활용비·클라우드컴퓨팅서비스 활용비)으로 배분" },
  { label: "2026-07-09 협약변경", reason: "비목 간 재배분 — 내부인건비(현금) 증액, 연구재료비·클라우드 감액, 시험성적비·특허출원비 신설 (첨부3 대비표)" },
];
const OFF_LEDGER = [
  { itemName: "인건비", subName: "내부인건비(현물)", detailName: null, fundType: "IN_KIND", amount: 30_600_000 },
  { itemName: "위탁연구개발비", subName: null, detailName: null, fundType: "CASH", amount: 35_999_000 },
];

const fmt = (n: number) => n.toLocaleString("ko-KR");

async function main() {
  const apply = process.argv.includes("--apply");
  const p = createPrisma();
  try {
    const year = await p.projectYear.findFirst({ where: { yearNo: YEAR_NO, project: { code: PROJECT_CODE } }, select: { id: true } });
    if (!year) throw new Error(`과제 ${PROJECT_CODE} ${YEAR_NO}년차 없음`);
    const txs = await p.transaction.findMany({
      where: { projectYearId: year.id, status: { not: "취소" }, direction: "IN" },
      select: { id: true, date: true, direction: true, amount: true, description: true, budgetAdjust: true, amendmentId: true, budgetItem: { select: { name: true, sortOrder: true } }, budgetSubItem: { select: { name: true } }, budgetDetailItem: { select: { name: true } } },
    });
    const adj = await p.transaction.findMany({
      where: { projectYearId: year.id, budgetAdjust: true, status: { not: "취소" } },
      select: { id: true, date: true, direction: true, amount: true, description: true, amendmentId: true, budgetItem: { select: { name: true, sortOrder: true } }, budgetSubItem: { select: { name: true } }, budgetDetailItem: { select: { name: true } } },
    });

    type Line = { itemName: string; subName: string | null; detailName: string | null; sortOrder: number; amount: number };
    const state = new Map<string, Line>();
    const bump = (t: (typeof adj)[number], v: number) => {
      const item = t.budgetItem?.name ?? "(미분류)";
      const sub = t.budgetSubItem?.name ?? null;
      const detail = t.budgetDetailItem?.name ?? null;
      const k = lineKey(item, sub, detail);
      const cur = state.get(k) ?? { itemName: item, subName: sub, detailName: detail, sortOrder: t.budgetItem?.sortOrder ?? 99, amount: 0 };
      cur.amount += v;
      state.set(k, cur);
    };
    // 최초 편성 = 조정이 아닌 입금
    for (const t of txs) if (!t.budgetAdjust) bump(t as (typeof adj)[number], t.amount);

    const claimed = new Set<string>();
    for (const plan of PLANS) {
      const mine = adj.filter((t) => t.description?.includes(`[${plan.label}]`));
      for (const t of mine) claimed.add(t.id);
      const before = new Map([...state].map(([k, v]) => [k, { ...v }]));
      for (const t of mine) bump(t, t.direction === "IN" ? t.amount : -t.amount);
      const keys = [...new Set([...before.keys(), ...state.keys()])];
      const lines = keys
        .map((k) => ({ ...(state.get(k) ?? before.get(k)!), beforeAmt: before.get(k)?.amount ?? 0, afterAmt: state.get(k)?.amount ?? 0 }))
        .filter((l) => l.beforeAmt !== 0 || l.afterAmt !== 0)
        .sort((a, b) => a.sortOrder - b.sortOrder || (a.subName ?? "").localeCompare(b.subName ?? "", "ko") || (a.detailName ?? "").localeCompare(b.detailName ?? "", "ko"));
      const date = mine.reduce<Date | null>((d, t) => (!d || t.date < d ? t.date : d), null);
      console.log(`\n■ ${plan.label} — 조정 레코드 ${mine.length}건, 기준일 ${date?.toISOString().slice(0, 10) ?? "-"}`);
      for (const l of lines) {
        const d = l.afterAmt - l.beforeAmt;
        console.log(`  ${l.itemName} > ${l.subName ?? "(공통)"}${l.detailName ? ` > ${l.detailName}` : ""}: ${fmt(l.beforeAmt)} → ${fmt(l.afterAmt)}${d ? ` (${d > 0 ? "+" : ""}${fmt(d)})` : ""}`);
      }
      for (const o of OFF_LEDGER) console.log(`  [장부 밖] ${o.itemName} > ${o.subName ?? "(공통)"} ${o.fundType}: ${fmt(o.amount)} (변동 없음)`);
      const sum = (pick: "beforeAmt" | "afterAmt") => lines.reduce((s, l) => s + l[pick], 0) + OFF_LEDGER.reduce((s, o) => s + o.amount, 0);
      console.log(`  합계 ${fmt(sum("beforeAmt"))} → ${fmt(sum("afterAmt"))}`);
      if (!mine.length) throw new Error(`"${plan.label}" 조정 레코드를 찾지 못했습니다.`);

      const exists = await p.budgetAmendment.findFirst({ where: { projectYearId: year.id, title: plan.label } });
      if (exists) {
        console.log(`  → 이미 있음 (${exists.id}), 건너뜀`);
        continue;
      }
      if (mine.some((t) => t.amendmentId)) throw new Error(`"${plan.label}" 레코드가 이미 다른 협약변경에 연결되어 있습니다.`);
      if (!apply) continue;
      const created = await p.$transaction(async (tx) => {
        const a = await tx.budgetAmendment.create({
          data: { projectYearId: year.id, title: plan.label, effectiveDate: date!, reason: plan.reason, status: "APPLIED", appliedAt: new Date() },
        });
        await tx.budgetAmendmentLine.createMany({
          data: [
            ...lines.map((l, i) => ({ amendmentId: a.id, itemName: l.itemName, subName: l.subName, detailName: l.detailName, fundType: "CASH", inLedger: true, beforeAmt: l.beforeAmt, afterAmt: l.afterAmt, sortOrder: i })),
            ...OFF_LEDGER.map((o, i) => ({ amendmentId: a.id, itemName: o.itemName, subName: o.subName, detailName: o.detailName, fundType: o.fundType, inLedger: false, beforeAmt: o.amount, afterAmt: o.amount, sortOrder: lines.length + i })),
          ],
        });
        await tx.transaction.updateMany({ where: { id: { in: mine.map((t) => t.id) } }, data: { amendmentId: a.id } });
        return a;
      });
      console.log(`  → 만들고 레코드 ${mine.length}건 연결: ${created.id}`);
    }
    const orphan = adj.filter((t) => !claimed.has(t.id));
    if (orphan.length) console.warn(`\n⚠ 어느 협약변경에도 속하지 않은 조정 레코드 ${orphan.length}건: ${orphan.map((t) => t.description).join(" / ")}`);
    if (!apply) console.log("\n(dry-run — 반영하려면 --apply)");
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
