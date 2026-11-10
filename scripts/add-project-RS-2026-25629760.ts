// 새 과제(협약 준비) 등록 — 참여율 계산용. 사용자가 보여준 범부처 통합 과제 팝업(과제기본) 내용. 이미 있으면 건너뜀.
import { createPrisma } from "../src/lib/db";
async function main() {
  const p = createPrisma();
  const code = "RS-2026-25629760";
  if (await p.project.findFirst({ where: { code } })) { console.log(`이미 있음: ${code}`); await p.$disconnect(); return; }
  const project = await p.project.create({
    data: {
      code,
      name: "GPS·WiFi 단절 재난·범죄 현장의 요구조자 3D 위치 탐지를 위한 착용형 Rescue Edge Node 기반 공간정보 적응형 측위 기술",
      businessName: "미래유망융합기술파이오니어(한계돌파 R&D)",
      hostOrg: "대진대학교",
      fundingAgency: "한국연구재단",
      piName: "유무영",
      status: "준비",
      startDate: new Date("2026-12-01"),
      endDate: new Date("2030-11-30"),
    },
  });
  const y = await p.projectYear.create({
    data: { projectId: project.id, yearNo: 1, label: "1단계-1년차", startDate: new Date("2026-12-01"), endDate: new Date("2027-11-30") },
  });
  console.log(`추가: ${code} / 1단계-1년차 (2026-12-01 ~ 2027-11-30) yearId=${y.id}`);
  await p.$disconnect();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
