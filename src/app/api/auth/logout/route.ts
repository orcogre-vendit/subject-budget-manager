// 로그아웃 — 세션 쿠키 삭제 후 로그인 화면으로
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { appOrigin } from "@/lib/auth/google";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const res = NextResponse.redirect(new URL("/login", appOrigin(request)), { status: 303 });
  res.cookies.delete({ name: SESSION_COOKIE, path: "/" });
  return res;
}
