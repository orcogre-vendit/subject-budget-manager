// 이미 저장된 첨부의 표시 파일명(Attachment.fileName)을 현재 규칙(normalizeFileName)으로 일괄 정리한다.
// 디스크 파일명(storedName, UUID)은 건드리지 않는다.
//
//   미리보기:  node_modules/.bin/tsx scripts/normalize-attachment-names.ts
//   적용:      node_modules/.bin/tsx scripts/normalize-attachment-names.ts --apply
//
// 도커 배포 서버에서는 컨테이너 안에서 같은 명령을 실행한다 (DATABASE_URL 은 .env 에서 읽음).
import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { normalizeFileName } from "../src/lib/uploadRules";

const apply = process.argv.includes("--apply");
const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  const rows = await prisma.attachment.findMany({ select: { id: true, fileName: true }, orderBy: { id: "asc" } });
  const changes = rows
    .map((r) => ({ id: r.id, before: r.fileName, after: normalizeFileName(r.fileName) }))
    .filter((c) => c.before !== c.after);

  console.log(`첨부 ${rows.length}건 중 정리 대상 ${changes.length}건${apply ? "" : " (미리보기 — --apply 로 적용)"}`);
  for (const c of changes) {
    console.log(`  #${c.id}: "${c.before}" (${[...c.before].length}자) → "${c.after}" (${[...c.after].length}자)`);
  }
  if (!apply || !changes.length) return;

  await prisma.$transaction(changes.map((c) => prisma.attachment.update({ where: { id: c.id }, data: { fileName: c.after } })));
  console.log(`적용 완료: ${changes.length}건`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
