// 모바일 화면 묶음 — 원장 보기(읽기 전용)와 사진 올리기만. 사이드바 없이 한 손으로 쓰기 좋은 크기로.
import Link from "next/link";

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-xl pb-16">
      <header className="sticky top-0 z-20 -mx-4 -mt-4 mb-4 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:-mt-6">
        <Link href="/m" className="text-base font-bold text-slate-900">
          📱 과제관리
        </Link>
        <Link href="/?pc=1" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600">
          PC 화면
        </Link>
      </header>
      {children}
    </div>
  );
}
