// 세션 쿠키 — Node 내장 crypto 로 HMAC 서명한 stateless 세션. proxy.ts(Node 런타임)·route handler·서버 컴포넌트가 공유.
// 라이브러리 추가 금지 제약 때문에 jose/next-auth 대신 직접 구현. 비밀값은 .env 에서만 읽는다.
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "sbm_session";
export const STATE_COOKIE = "sbm_oauth_state";
/** 세션 유효기간 (초) — 7일. 만료되면 다시 구글 로그인 */
export const SESSION_TTL_SEC = 7 * 24 * 60 * 60;

export type Session = {
  email: string;
  name: string;
  picture: string;
  /** 만료 시각 (epoch 초) */
  exp: number;
};

/** GOOGLE_CLIENT_ID·GOOGLE_CLIENT_SECRET·SESSION_SECRET 이 모두 있어야 로그인 게이트가 켜진다. 없으면(로컬 개발) 기존처럼 무인증 */
export function authEnabled(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.SESSION_SECRET);
}

/** 허용 도메인 목록 (AUTH_ALLOWED_DOMAINS, 쉼표 구분). 기본 vendit.co.kr */
export function allowedDomains(): string[] {
  const raw = process.env.AUTH_ALLOWED_DOMAINS || "vendit.co.kr";
  return raw.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
}

/** 이메일이 허용 도메인 소속인지. 구글 hd 클레임이 있으면 그것도 같이 본다 */
export function isAllowedAccount(email: string, hd?: string | null): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  const list = allowedDomains();
  if (!domain || !list.includes(domain)) return false;
  if (hd && hd.toLowerCase() !== domain) return false;
  return true;
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET 이 설정되지 않았습니다.");
  return s;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function hmac(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

/** payload → "base64url(json).base64url(hmac)" */
export function signSession(session: Omit<Session, "exp"> & { exp?: number }): string {
  const full: Session = { ...session, exp: session.exp ?? Math.floor(Date.now() / 1000) + SESSION_TTL_SEC };
  const body = b64url(JSON.stringify(full));
  return `${body}.${hmac(body)}`;
}

/** 서명·만료 검증. 실패하면 null */
export function verifySession(token: string | undefined | null): Session | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let expected: string;
  try {
    expected = hmac(body);
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<Session>;
    if (typeof parsed.email !== "string" || typeof parsed.exp !== "number") return null;
    if (parsed.exp <= Math.floor(Date.now() / 1000)) return null;
    return { email: parsed.email, name: parsed.name ?? "", picture: parsed.picture ?? "", exp: parsed.exp };
  } catch {
    return null;
  }
}

/** 로그인 후 돌아갈 경로 — 같은 사이트 내 경로만 허용 (오픈 리다이렉트 방지) */
export function safeNextPath(input: string | null | undefined): string {
  if (!input || !input.startsWith("/") || input.startsWith("//") || input.startsWith("/api/auth")) return "/";
  return input;
}
