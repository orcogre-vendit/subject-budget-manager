// 로그인 게이트 — 세션 쿠키가 없으면 /login 으로. GOOGLE_CLIENT_ID 등 설정이 없으면(로컬 개발) 통과.
// Next 16 proxy 는 Node 런타임이라 node:crypto 기반 세션 검증을 그대로 쓴다.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authEnabled, verifySession } from "@/lib/auth/session";

const PUBLIC_PREFIXES = ["/login", "/api/auth/", "/api/health"];

/** 휴대폰으로 첫 화면(/)에 들어오면 모바일 화면(/m)으로. ?pc=1 이면 PC 화면 그대로 */
function mobileHome(request: NextRequest): NextResponse | null {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname !== "/" || searchParams.has("pc")) return null;
  const ua = request.headers.get("user-agent") ?? "";
  if (!/iPhone|Android.+Mobile|Mobile Safari|SamsungBrowser.+Mobile/i.test(ua)) return null;
  return NextResponse.redirect(new URL("/m", process.env.APP_URL || request.url));
}

export function proxy(request: NextRequest) {
  if (!authEnabled()) return mobileHome(request) ?? NextResponse.next();
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) return NextResponse.next();

  const session = verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return mobileHome(request) ?? NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  // APP_URL 이 있으면 공개 주소 기준 (Lambda 내부 주소로 튕기지 않게)
  const login = new URL("/login", process.env.APP_URL || request.url);
  login.searchParams.set("next", `${pathname}${search}`);
  const res = NextResponse.redirect(login);
  if (request.cookies.has(SESSION_COOKIE)) res.cookies.delete({ name: SESSION_COOKIE, path: "/" });
  return res;
}

export const config = {
  // 정적 파일·이미지 최적화·파비콘은 제외
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?)$).*)"],
};
