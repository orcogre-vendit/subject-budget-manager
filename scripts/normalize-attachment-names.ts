// 이미 저장된 첨부의 표시 파일명(Attachment.fileName)을 현재 규칙 "연번-증빙종류-거래처-비목.ext" 로 일괄 개명한다.
// 원본 이름은 originalName 에 보관(이미 있으면 유지)하고, 디스크 파일명(storedName, UUID)은 건드리지 않는다.
// 거래 연번(seqNo)이 없는 거래는 연차 안에서 (날짜, id) 순으로 먼저 부여한다.
//
//   미리보기:  node_modules/.bin/tsx scripts/normalize-attachment-names.ts
//   적용:      node_modules/.bin/tsx scripts/normalize-attachment-names.ts --apply
//
// 도커 배포 서버에서는 컨테이너 안에서 같은 명령을 실행한다 (DATABASE_URL 은 .env 에서 읽음).
import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { pickEvidenceFileName } from "../src/lib/evidenceName";
import { normalizeFileName } from "../src/lib/uploadRules";

const apply = process.argv.includes("--apply");
const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

async function assignSeqNos() {
  const years = await prisma.projectYear.findMany({ select: { id: true } });
  let assigned = 0;
  for (const y of years) {
    const txs = await prisma.transaction.findMany({
      where: { projectYearId: y.id },
      select: { id: true, seqNo: true },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    });
    let max = Math.max(0, ...txs.map((t) => t.seqNo ?? 0));
    for (const t of txs) {
      if (t.seqNo) continue;
      max += 1;
      console.log(`  연번 부여: 거래 #${t.id} → ${max} (연차 ${y.id})`);
      if (apply) await prisma.transaction.update({ where: { id: t.id }, data: { seqNo: max } });
      assigned++;
    }
  }
  return assigned;
}

async function main() {
  console.log(apply ? "== 적용 모드" : "== 미리보기 (--apply 로 적용)");
  const assigned = await assignSeqNos();
  console.log(`연번 부여 ${assigned}건`);

  const txs = await prisma.transaction.findMany({
    where: { attachments: { some: {} } },
    select: {
      id: true,
      seqNo: true,
      vendor: true,
      budgetItem: { select: { name: true } },
      attachments: { select: { id: true, fileName: true, originalName: true, evidenceCode: true }, orderBy: { id: "asc" } },
    },
    orderBy: { id: "asc" },
  });

  let changed = 0;
  for (const tx of txs) {
    const ctx = { seqNo: tx.seqNo, vendor: tx.vendor, budgetItem: tx.budgetItem?.name ?? null };
    const taken = new Set<string>();
    for (const a of tx.attachments) {
      const originalName = a.originalName ?? normalizeFileName(a.fileName);
      const fileName = pickEvidenceFileName(ctx, a.evidenceCode, originalName, taken);
      if (fileName === a.fileName && a.originalName) continue;
      console.log(`  #${a.id}: "${a.fileName}" → "${fileName}"  (원본: ${originalName})`);
      if (apply) await prisma.attachment.update({ where: { id: a.id }, data: { fileName, originalName } });
      changed++;
    }
  }
  console.log(`첨부 개명 ${changed}건${apply ? " 적용 완료" : ""}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
