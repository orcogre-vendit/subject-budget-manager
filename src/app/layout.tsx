import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { currentUser } from "@/lib/auth/current";
import { authEnabled } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "과제관리 시스템",
  description: "연구실 과제 예산집행 관리 시스템",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await currentUser();
  // 로그인 게이트가 켜져 있는데 세션이 없으면 /login 뿐이므로(proxy 가 나머지를 막음) 사이드바 없이 렌더
  const bare = authEnabled() && !user;

  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 text-slate-900">
        {bare ? (
          children
        ) : (
          <div className="flex min-h-screen w-full max-w-full flex-col md:flex-row">
            <Sidebar user={user ? { email: user.email, name: user.name, picture: user.picture } : null} />
            <main className="min-w-0 w-full max-w-full flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">{children}</main>
          </div>
        )}
      </body>
    </html>
  );
}
