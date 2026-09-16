"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

/** 행 어디를 눌러도 href 로 이동하는 <tr>. 행 안의 링크·버튼·폼 클릭은 그대로 둔다 */
export default function ClickableRow({
  href,
  selected = false,
  children,
}: {
  href: string;
  selected?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const onClick = (e: MouseEvent<HTMLTableRowElement>) => {
    if ((e.target as HTMLElement).closest("a,button,form,input,select")) return;
    router.push(href);
  };
  return (
    <tr
      onClick={onClick}
      aria-selected={selected}
      className={`cursor-pointer border-b border-slate-100 last:border-0 ${
        selected ? "bg-amber-50 hover:bg-amber-50" : "hover:bg-slate-50"
      }`}
    >
      {children}
    </tr>
  );
}
