import { writeFileSync } from "node:fs";
import { createPrisma } from "../src/lib/db";
const PLAN = [
  { id: "8357d2ea-2e58-4f9b-b48f-f900ca664b9d", from: 9355000, to: 30000000 },
  { id: "c6090c80-e95d-4016-9af5-0b2ca006cd56", from: 9500000, to: 4000000 },
  { id: "8120a692-76c6-4598-a7e1-f682db74fdc7", from: 47061000, to: 31916000,
    note: " / 세부: 외부전문기술활용비 20,000,000 · 클라우드컴퓨팅서비스 활용비 8,916,000 · 특허출원비 1,000,000 · 시험성적비 2,000,000" },
];
const fmt = (n: number) => n.toLocaleString("ko-KR");
async function main() {
  const p = createPrisma();
  const before = await p.transaction.findMany({ where: { id: { in: PLAN.map((x) => x.id) } }, select: { id: true, amount: true, description: true, direction: true } });
  for (const x of PLAN) {
    const b = before.find((t) => t.id === x.id);
    if (!b || b.direction !== "IN" || b.amount !== x.from) throw new Error(`사전 확인 실패: ${x.id} ${b?.amount}`);
  }
  writeFileSync(".migration-src/amend-20261020-backup.json", JSON.stringify(before, null, 1));
  // 합계 불변 검증
  const delta = PLAN.reduce((s, x) => s + (x.to - x.from), 0);
  if (delta !== 0) throw new Error(`증감 합계가 0 이 아님: ${delta}`);
  await p.$transaction(PLAN.map((x) => {
    const b = before.find((t) => t.id === x.id)!;
    return p.transaction.update({ where: { id: x.id }, data: {
      amount: x.to,
      description: `${b.description} [2026-07-09 협약변경 ${fmt(x.from)}→${fmt(x.to)}]${x.note ?? ""}`,
    } });
  }));
  const after = await p.transaction.findMany({ where: { id: { in: PLAN.map((x) => x.id) } }, select: { amount: true, description: true } });
  for (const a of after) console.log(a.amount, a.description);
  const sum = await p.transaction.aggregate({ where: { direction: "IN", status: { not: "취소" } }, _sum: { amount: true } });
  console.log("IN 합계:", sum._sum.amount);
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
