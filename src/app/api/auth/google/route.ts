// 구글 로그인 시작 — CSRF 용 state 를 쿠키에 심고 구글 동의 화면으로 보낸다
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { buildAuthUrl } from "@/lib/auth/google";
import { STATE_COOKIE, allowedDomains, authEnabled, safeNextPath } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!authEnabled()) return NextResponse.redirect(new URL("/login?error=config", url));

  const nonce = randomBytes(24).toString("base64url");
  const next = safeNextPath(url.searchParams.get("next"));
  const state = `${nonce}.${Buffer.from(next).toString("base64url")}`;
  const domains = allowedDomains();

  const res = NextResponse.redirect(buildAuthUrl(request, state, domains.length === 1 ? domains[0] : undefined));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    path: "/api/auth",
    maxAge: 600,
  });
  return res;
}
