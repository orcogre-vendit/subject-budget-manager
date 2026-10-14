"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "대시보드", icon: "📊" },
  { href: "/projects", label: "과제 관리", icon: "📁" },
  { href: "/researchers", label: "연구원 관리", icon: "👥" },
  { href: "/budget", label: "기준정보(비목)", icon: "🏷️" },
  { href: "/rcms", label: "RCMS 대조", icon: "🔁" },
];

export type SidebarUser = { email: string; name: string; picture: string };

export default function Sidebar({ user }: { user: SidebarUser | null }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-slate-200 bg-white md:w-60 md:border-r md:border-b-0">
      <div className="border-b border-slate-200 px-4 py-3 md:px-5 md:py-5">
        <p className="text-base font-bold text-slate-900">과제관리 시스템</p>
        <p className="mt-0.5 hidden text-xs text-slate-500 md:block">예산집행 관리</p>
      </div>
      <nav className="flex gap-1 overflow-x-auto p-2 md:flex-col md:gap-0.5 md:p-3">
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors md:gap-2.5 ${
                active
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      {user && (
        <div className="flex items-center gap-2 border-t border-slate-200 px-4 py-2 md:mt-auto md:px-5 md:py-3">
          {user.picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-7 w-7 shrink-0 rounded-full ring-1 ring-slate-200" />
          ) : (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
              {(user.name || user.email).slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-slate-800">{user.name || user.email}</p>
            {user.name && <p className="truncate text-[11px] text-slate-400">{user.email}</p>}
          </div>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="text-xs text-slate-500 hover:text-slate-900 hover:underline">로그아웃</button>
          </form>
        </div>
      )}
    </aside>
  );
}
