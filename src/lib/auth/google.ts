// 구글 OAuth 2.0 (OpenID Connect) — 라이브러리 없이 fetch 로 인가코드 교환. 토큰 endpoint 를 TLS 로 직접 호출하므로
// id_token 서명을 별도 검증하지 않고 payload 를 신뢰한다 (구글 공식 가이드의 허용 패턴).
import "server-only";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export type GoogleProfile = {
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string;
  hd: string | null;
};

/** 요청의 공개 origin — APP_URL 이 있으면 그것(리다이렉트 URI 는 구글에 등록한 값과 정확히 같아야 함), 없으면 프록시 헤더/Host 로 계산 */
export function appOrigin(request: Request): string {
  const fixed = process.env.APP_URL?.replace(/\/+$/, "");
  if (fixed) return fixed;
  const h = request.headers;
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || new URL(request.url).protocol.replace(":", "");
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host") || new URL(request.url).host;
  return `${proto}://${host}`;
}

export function redirectUri(request: Request): string {
  return `${appOrigin(request)}/api/auth/callback`;
}

export function buildAuthUrl(request: Request, state: string, hintDomain?: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID 가 설정되지 않았습니다.");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(request),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
    access_type: "online",
  });
  // hd 는 계정 선택 화면 필터일 뿐 보안 경계가 아니다. 실제 검증은 callback 의 isAllowedAccount
  if (hintDomain) params.set("hd", hintDomain);
  return `${AUTH_URL}?${params.toString()}`;
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("id_token 형식이 올바르지 않습니다.");
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
}

/** 인가코드 → 토큰 교환 → 프로필. 실패 시 throw */
export async function exchangeCode(request: Request, code: string): Promise<GoogleProfile> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("구글 OAuth 설정이 없습니다.");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(request),
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error("Google token exchange failed", res.status, detail.slice(0, 300));
    throw new Error(`구글 토큰 교환 실패 (${res.status})`);
  }
  const body = (await res.json()) as { id_token?: string };
  if (!body.id_token) throw new Error("구글 응답에 id_token 이 없습니다.");

  const p = decodeJwtPayload(body.id_token);
  const aud = p.aud;
  if (aud !== clientId) throw new Error("id_token 의 aud 가 다릅니다.");
  const iss = p.iss;
  if (iss !== "https://accounts.google.com" && iss !== "accounts.google.com") throw new Error("id_token 발급자가 구글이 아닙니다.");
  const email = typeof p.email === "string" ? p.email : "";
  if (!email) throw new Error("구글 계정 이메일을 받지 못했습니다.");
  return {
    email,
    emailVerified: p.email_verified === true,
    name: typeof p.name === "string" ? p.name : "",
    picture: typeof p.picture === "string" ? p.picture : "",
    hd: typeof p.hd === "string" ? p.hd : null,
  };
}
