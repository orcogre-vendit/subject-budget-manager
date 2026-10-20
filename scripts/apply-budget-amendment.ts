// 협약변경(비목 재배분) 반영 — 기존 편성 레코드는 건드리지 않고 조정 레코드(+입금 증액 / −출금 감액)를 추가한다.
// 사용: tsx scripts/apply-budget-amendment.ts <plan.json> [--apply]   (기본은 dry-run)
// plan.json: { "projectCode": "RS-...", "yearNo": 1, "date": "2026-07-09", "label": "2026-07-09 협약변경",
//              "entries": [ { "item": "인건비", "sub": "내부인건비(현금)", "detail": null, "delta": 20645000, "note": "…" }, … ] }
// 같은 label 로 이미 넣은 조정이 있으면 중단한다(두 번 넣기 방지). 증감 합계가 0 이 아니면 경고.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { createPrisma } from "../src/lib/db";
import { findItem, findSub, findOrCreateDetail } from "../src/lib/categories";

type Entry = { item: string; sub?: string | null; detail?: string | null; delta: number; note?: string };
type Plan = { projectCode: string; yearNo: number; date: string; label: string; entries: Entry[] };

const fmt = (n: number) => n.toLocaleString("ko-KR");

async function main() {
  const [file, flag] = process.argv.slice(2);
  if (!file) throw new Error("plan.json 경로가 필요합니다.");
  const apply = flag === "--apply";
  const plan = JSON.parse(readFileSync(file, "utf8")) as Plan;
  const p = createPrisma();
  try {
    const year = await p.projectYear.findFirst({
      where: { yearNo: plan.yearNo, project: { code: plan.projectCode } },
      select: { id: true },
    });
    if (!year) throw new Error(`과제 ${plan.projectCode} ${plan.yearNo}년차를 찾지 못했습니다.`);

    const dup = await p.transaction.count({
      where: { projectYearId: year.id, budgetAdjust: true, description: { contains: `[${plan.label}]` } },
    });
    if (dup) throw new Error(`이미 "${plan.label}" 조정 ${dup}건이 있습니다. 중복 반영 방지로 중단합니다.`);

    const net = plan.entries.reduce((s, e) => s + e.delta, 0);
    if (net !== 0) console.warn(`⚠ 증감 합계가 0 이 아닙니다: ${fmt(net)}원 (총액 변경 협약이면 정상)`);

    // 분류 확인 — 비목·세목은 기존 것만(오타로 새 분류가 생기지 않게), 세세목은 필요하면 만든다
    const rows = [];
    for (const e of plan.entries) {
      if (!Number.isInteger(e.delta) || e.delta === 0) throw new Error(`증감은 0 이 아닌 정수(원)여야 합니다: ${e.item} ${e.delta}`);
      const bi = await findItem(p, e.item);
      if (!bi) throw new Error(`비목 없음: ${e.item}`);
      const bs = e.sub ? await findSub(p, bi.id, e.sub) : null;
      if (e.sub && !bs) throw new Error(`세목 없음: ${e.item} > ${e.sub}`);
      rows.push({ e, bi, bs });
    }

    let seq = ((await p.transaction.aggregate({ where: { projectYearId: year.id }, _max: { seqNo: true } }))._max.seqNo ?? 0);
    for (const { e, bi, bs } of rows) {
      const dir = e.delta > 0 ? "IN" : "OUT";
      const path = [e.item, e.sub, e.detail].filter(Boolean).join(" > ");
      const description = `${e.delta > 0 ? "편성 증액" : "편성 감액"}-${path} [${plan.label}]${e.note ? ` ${e.note}` : ""}`;
      console.log(`${dir === "IN" ? "+" : "−"}${fmt(Math.abs(e.delta))}  ${description}`);
      if (!apply) continue;
      const bd = bs && e.detail ? await findOrCreateDetail(p, bs.id, e.detail) : null;
      await p.transaction.create({
        data: {
          projectYearId: year.id,
          seqNo: ++seq,
          date: new Date(plan.date),
          status: "완료",
          direction: dir,
          amount: Math.abs(e.delta),
          vatRate: 0,
          vatAmount: 0,
          description,
          budgetAdjust: true,
          budgetItemId: bi.id,
          budgetSubItemId: bs?.id ?? null,
          budgetDetailItemId: bd?.id ?? null,
        },
      });
    }
    console.log(apply ? `반영 완료 ${rows.length}건 (증감 합계 ${fmt(net)}원)` : "dry-run — 반영하려면 --apply");
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
