// DSQL 에 Prisma 마이그레이션 적용 — IAM 토큰(15분)으로 DATABASE_URL 을 만들어 `prisma migrate deploy` 를 돌린다.
// 사용: DSQL_ENDPOINT=… npm run db:migrate   (AWS 자격증명은 프로필/환경변수)
// DSQL 은 트랜잭션당 DDL 1개라 migration.sql 이 BEGIN/COMMIT 블록으로 쪼개져 있고(aurora-dsql-prisma 가 생성),
// advisory lock 은 지원하지 않아 PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1 이 필요하다.
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { Client } from "pg";
import { dsqlPoolConfig, dsqlUrl } from "../src/lib/db";

/**
 * CREATE INDEX ASYNC / VALIDATE CONSTRAINT 는 비동기 작업(sys.jobs)으로 돌아간다. 인덱스가 다 서기 전에 seed 가
 * upsert(ON CONFLICT) 를 치면 "no unique constraint matching the ON CONFLICT specification" 으로 실패하므로 끝날 때까지 기다린다.
 */
async function waitForDdlJobs(timeoutMs = 10 * 60_000) {
  const client = new Client(dsqlPoolConfig());
  await client.connect();
  try {
    const started = Date.now();
    for (;;) {
      const { rows } = await client.query<{ n: string }>(
        "select count(*)::text as n from sys.jobs where status not in ('completed','failed')",
      );
      const n = Number(rows[0]?.n ?? 0);
      if (n === 0) break;
      if (Date.now() - started > timeoutMs) throw new Error(`DDL 비동기 작업 ${n}개가 ${timeoutMs / 1000}초 안에 끝나지 않았습니다.`);
      console.log(`  비동기 DDL 작업 ${n}개 진행 중… 대기`);
      await new Promise((r) => setTimeout(r, 3000));
    }
    const failed = await client.query<{ job_id: string; details: string | null }>(
      "select job_id, details from sys.jobs where status = 'failed'",
    );
    if (failed.rows.length) console.warn("⚠ 실패한 DDL 작업:", JSON.stringify(failed.rows));
  } finally {
    await client.end();
  }
}

async function main() {
  const url = await dsqlUrl();
  const args = process.argv.slice(2);
  const sub = args.length ? args : ["migrate", "deploy"];
  const res = spawnSync("node_modules/.bin/prisma", sub, {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "1" },
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
  if (sub[0] === "migrate") await waitForDdlJobs();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
