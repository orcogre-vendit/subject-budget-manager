"use client";

// 참여율 계산 화면의 "+ 과제 추가" — 협약 준비 중인 새 과제를 과제·1년차 한 번에 만든다
import { useActionState, useState } from "react";
import type { QuickProjectState } from "@/app/researchers/participation/actions";

type Action = (prev: QuickProjectState, fd: FormData) => Promise<QuickProjectState>;
const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900";

function F({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block text-xs font-medium text-slate-600 ${wide ? "sm:col-span-2 lg:col-span-3" : ""}`}>
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export default function QuickProjectForm({ action }: { action: Action }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, {});
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-dashed border-slate-400 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">
        + 과제 추가
      </button>
    );
  }
  return (
    <form action={formAction} className="mt-3 w-full rounded-xl border border-blue-200 bg-blue-50/60 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-900">새 과제 추가 (과제 + 1년차)</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-500 hover:underline">닫기</button>
      </div>
      <p className="mt-1 text-xs text-slate-500">협약 준비 중인 과제를 바로 참여율 계산에 쓸 수 있게 만듭니다. 나머지 정보는 과제 관리에서 채우세요.</p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <F label="과제번호"><input name="code" placeholder="RS-2026-…" className={input} /></F>
        <F label="과제명 *" wide><input name="name" required className={input} /></F>
        <F label="사업명(내역사업)"><input name="businessName" className={input} /></F>
        <F label="주관연구개발기관"><input name="hostOrg" className={input} /></F>
        <F label="전문기관(지원기관)"><input name="fundingAgency" className={input} /></F>
        <F label="연구책임자"><input name="piName" className={input} /></F>
        <F label="총 개발기간 시작"><input type="date" name="projectStart" className={input} /></F>
        <F label="총 개발기간 종료"><input type="date" name="projectEnd" className={input} /></F>
        <F label="1년차 표시 라벨"><input name="yearLabel" placeholder="1단계-1년차" className={input} /></F>
        <F label="1년차 시작 *"><input type="date" name="startDate" required className={input} /></F>
        <F label="1년차 종료 *"><input type="date" name="endDate" required className={input} /></F>
      </div>
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
        {pending ? "만드는 중…" : "과제 만들고 참여율 계산하기"}
      </button>
    </form>
  );
}
