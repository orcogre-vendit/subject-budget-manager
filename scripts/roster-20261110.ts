// 연구원 명단 정리 (2026-11-10 사용자 요청): 김똘킹 삭제, 최예지·박수연·김윤후·임채성·유성근 추가. 여러 번 돌려도 안전.
import { createPrisma } from "../src/lib/db";
const ADD = [
  { name: "유성근", title: "연구책임자", affiliation: "주식회사 벤디트 R&D팀", workPhone: "1644-5442", phone: "010-2713-5922" },
  { name: "최예지" }, { name: "박수연" }, { name: "김윤후" }, { name: "임채성" },
];
async function main() {
  const p = createPrisma();
  const drop = await p.researcher.findMany({ where: { name: "김똘킹" }, include: { ledProjects: { select: { id: true } }, participations: { select: { id: true } } } });
  for (const d of drop) {
    if (d.ledProjects.length || d.participations.length) { console.log(`김똘킹 유지(참조 있음)`); continue; }
    await p.researcher.delete({ where: { id: d.id } });
    console.log(`삭제: 김똘킹 (${d.title ?? ""} ${d.affiliation ?? ""})`);
  }
  for (const a of ADD) {
    const hit = await p.researcher.findFirst({ where: { name: a.name } });
    if (hit) { console.log(`이미 있음: ${a.name}`); continue; }
    await p.researcher.create({ data: a });
    console.log(`추가: ${a.name}`);
  }
  const yoo = await p.researcher.findFirst({ where: { name: "유성근" } });
  if (yoo) {
    const r = await p.project.updateMany({ where: { piName: "유성근", piId: null }, data: { piId: yoo.id } });
    if (r.count) console.log(`과제 ${r.count}건 연구책임자를 유성근 레코드에 연결`);
  }
  console.log("명단:", (await p.researcher.findMany({ orderBy: { name: "asc" }, select: { name: true } })).map((x) => x.name).join(", "));
  await p.$disconnect();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
