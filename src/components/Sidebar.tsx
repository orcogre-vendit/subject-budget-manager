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

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-full shrink-0 border-b border-slate-200 bg-white md:w-60 md:border-r md:border-b-0">
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
    </aside>
  );
}
