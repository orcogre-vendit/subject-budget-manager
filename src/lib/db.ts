// Prisma 클라이언트 팩토리 — Aurora DSQL(PostgreSQL 호환)에 IAM 토큰으로 접속.
// 앱(src/lib/prisma.ts)·seed·마이그레이션 스크립트가 같이 쓴다. seed(tsx)에서도 부르므로 상대 경로 import.
// 토큰은 연결마다 새로 발급(기본 15분 유효). 비밀번호 대신 토큰을 쓰므로 .env 에 DB 비밀번호가 없다.
import net from "node:net";
import { Pool, type PoolConfig } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { DsqlSigner } from "@aws-sdk/dsql-signer";
import { PrismaClient } from "../generated/prisma/client";

// Node 20+ 는 IPv6/IPv4 를 번갈아 시도하는 happy-eyeballs 가 기본이고 시도당 250ms 뒤 ETIMEDOUT 을 낸다.
// DSQL TLS 연결은 병렬로 여러 개 열면 250ms 를 넘겨 "ETIMEDOUT" 이 즉시 나므로(검증됨) 시도 제한을 넉넉히 둔다.
if (net.getDefaultAutoSelectFamilyAttemptTimeout() < 10_000) net.setDefaultAutoSelectFamilyAttemptTimeout(10_000);

export type DsqlTarget = { host: string; region: string; user: string };

/** DSQL_ENDPOINT(예: abc.dsql.ap-northeast-2.on.aws) 에서 접속 대상 추출. 리전은 호스트명에서 읽고 AWS_REGION 이 있으면 우선 */
export function dsqlTarget(): DsqlTarget {
  const host = process.env.DSQL_ENDPOINT?.trim();
  if (!host) throw new Error("DSQL_ENDPOINT 가 설정되지 않았습니다.");
  const fromHost = host.match(/\.dsql\.([a-z0-9-]+)\.on\.aws$/)?.[1];
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || fromHost;
  if (!region) throw new Error("DSQL 리전을 알 수 없습니다. AWS_REGION 을 설정하세요.");
  return { host, region, user: process.env.DSQL_USER || "admin" };
}

/** 접속 토큰 — admin 은 DbConnectAdmin, 그 외는 DbConnect 권한 필요 */
export async function dsqlToken(target: DsqlTarget = dsqlTarget()): Promise<string> {
  const signer = new DsqlSigner({ hostname: target.host, region: target.region, expiresIn: 900 });
  return target.user === "admin" ? signer.getDbConnectAdminAuthToken() : signer.getDbConnectAuthToken();
}

/** prisma CLI(migrate deploy)용 접속 URL — 토큰은 15분짜리이므로 매번 새로 만든다 */
export async function dsqlUrl(): Promise<string> {
  const t = dsqlTarget();
  const token = await dsqlToken(t);
  return `postgresql://${encodeURIComponent(t.user)}:${encodeURIComponent(token)}@${t.host}:5432/postgres?sslmode=verify-full`;
}

export function dsqlPoolConfig(): PoolConfig {
  const t = dsqlTarget();
  return {
    host: t.host,
    port: 5432,
    user: t.user,
    database: "postgres",
    ssl: { rejectUnauthorized: true },
    password: () => dsqlToken(t), // 연결을 열 때마다 호출된다
    max: 4, // Lambda 1 인스턴스는 요청을 하나씩 처리하므로 작게
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 15_000,
  };
}

export function createPrisma(): PrismaClient {
  const adapter = new PrismaPg(new Pool(dsqlPoolConfig()));
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}
