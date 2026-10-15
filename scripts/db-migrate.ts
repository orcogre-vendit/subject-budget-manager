// DSQL 에 Prisma 마이그레이션 적용 — IAM 토큰(15분)으로 DATABASE_URL 을 만들어 `prisma migrate deploy` 를 돌린다.
// 사용: DSQL_ENDPOINT=… npm run db:migrate   (AWS 자격증명은 프로필/환경변수)
// DSQL 은 트랜잭션당 DDL 1개라 migration.sql 이 BEGIN/COMMIT 블록으로 쪼개져 있고(aurora-dsql-prisma 가 생성),
// advisory lock 은 지원하지 않아 PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1 이 필요하다.
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { dsqlUrl } from "../src/lib/db";

async function main() {
  const url = await dsqlUrl();
  const args = process.argv.slice(2);
  const sub = args.length ? args : ["migrate", "deploy"];
  const res = spawnSync("node_modules/.bin/prisma", sub, {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "1" },
  });
  process.exit(res.status ?? 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
