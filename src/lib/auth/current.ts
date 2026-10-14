// 서버 컴포넌트·서버 액션에서 현재 로그인 사용자 읽기
import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, authEnabled, verifySession, type Session } from "@/lib/auth/session";

/** 로그인 게이트가 꺼져 있으면(로컬 개발) null 이지만 접근은 허용된다는 뜻. 켜져 있고 null 이면 미로그인 */
export async function currentUser(): Promise<Session | null> {
  if (!authEnabled()) return null;
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}
