// 구글 콜백 — state 검증 → 코드 교환 → 도메인 제한 → 세션 쿠키 발급
import { NextResponse } from "next/server";
import { appOrigin, exchangeCode } from "@/lib/auth/google";
import {
  SESSION_COOKIE,
  SESSION_TTL_SEC,
  STATE_COOKIE,
  authEnabled,
  isAllowedAccount,
  safeNextPath,
  signSession,
} from "@/lib/auth/session";

export const runtime = "nodejs";

function fail(request: Request, code: string) {
  // Lambda 안의 request.url 은 내부 주소(localhost:8080)라 공개 주소 기준으로 돌려보낸다
  const res = NextResponse.redirect(new URL(`/login?error=${code}`, appOrigin(request)));
  res.cookies.delete({ name: STATE_COOKIE, path: "/api/auth" });
  return res;
}

function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export async function GET(request: Request) {
  if (!authEnabled()) return fail(request, "config");
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = readCookie(request, STATE_COOKIE);
  if (url.searchParams.get("error")) return fail(request, "denied");
  if (!code || !state || !expected || state !== expected) return fail(request, "state");

  let profile;
  try {
    profile = await exchangeCode(request, code);
  } catch (error) {
    console.error("Google sign-in failed", error);
    return fail(request, "exchange");
  }
  if (!profile.emailVerified || !isAllowedAccount(profile.email, profile.hd)) {
    console.warn("Google sign-in rejected (domain)", profile.email);
    return fail(request, "domain");
  }

  const nextEncoded = state.split(".")[1] ?? "";
  const next = safeNextPath(nextEncoded ? Buffer.from(nextEncoded, "base64url").toString("utf8") : "/");
  const res = NextResponse.redirect(new URL(next, appOrigin(request)));
  res.cookies.set(SESSION_COOKIE, signSession({ email: profile.email, name: profile.name, picture: profile.picture }), {
    httpOnly: true,
    sameSite: "lax",
    secure: appOrigin(request).startsWith("https:"),
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
  res.cookies.delete({ name: STATE_COOKIE, path: "/api/auth" });
  return res;
}
