// 로그인 화면 — 구글 계정(허용 도메인) 으로만 입장
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current";
import { allowedDomains, authEnabled, safeNextPath } from "@/lib/auth/session";

const ERRORS: Record<string, string> = {
  domain: "허용되지 않은 계정입니다. 회사 구글 계정으로 다시 로그인하세요.",
  state: "로그인 요청이 만료됐거나 올바르지 않습니다. 다시 시도하세요.",
  exchange: "구글 인증에 실패했습니다. 잠시 후 다시 시도하세요.",
  denied: "구글 로그인이 취소됐습니다.",
  config: "로그인 설정(GOOGLE_CLIENT_ID 등)이 서버에 없습니다. 관리자에게 문의하세요.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  if (!authEnabled() || (await currentUser())) redirect(safeNextPath(next));

  const domains = allowedDomains();
  const href = `/api/auth/google?next=${encodeURIComponent(safeNextPath(next))}`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-lg font-bold text-slate-900">과제관리 시스템</p>
        <p className="mt-1 text-sm text-slate-500">연구비 예산집행 관리</p>

        {error && ERRORS[error] && (
          <p role="alert" className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{ERRORS[error]}</p>
        )}

        <a
          href={href}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          <svg aria-hidden width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.5l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
            <path fill="#FBBC05" d="M10.5 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.7l7.9-6.1z" />
            <path fill="#34A853" d="M24 48c6.3 0 11.6-2.1 15.4-5.7l-7.5-5.8c-2.1 1.4-4.8 2.3-7.9 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
          </svg>
          Google 계정으로 로그인
        </a>
        <p className="mt-3 text-center text-xs text-slate-400">
          {domains.map((d) => `@${d}`).join(", ")} 계정만 로그인할 수 있습니다.
        </p>
      </div>
    </div>
  );
}
