"use client";

// 반영된 협약변경의 버튼 — 인쇄, 대비표 복사, 반영 취소
import { useState } from "react";
import { useRouter } from "next/navigation";
import { comparisonTsv } from "@/components/AmendmentComparison";
import type { AmendLine } from "@/lib/amendment";
import type { ActResult } from "@/app/projects/[id]/years/[yearId]/amendments/actions";

export default function AmendmentAppliedActions({
  amendmentId,
  lines,
  unapply,
}: {
  amendmentId: string;
  lines: AmendLine[];
  unapply: (id: string) => Promise<ActResult>;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3 print:hidden">
      <button type="button" onClick={() => window.print()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">🖨️ 대비표 인쇄</button>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(comparisonTsv(lines, "thousand"));
            setMsg({ ok: true, text: "대비표를 복사했습니다." });
          } catch {
            setMsg({ ok: false, text: "복사하지 못했습니다." });
          }
        }}
        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
      >
        📋 대비표 복사 (천원)
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (!window.confirm("이 협약변경이 장부에 추가한 조정 레코드를 지우고 초안으로 되돌립니다. 원 편성은 그대로입니다. 진행할까요?")) return;
          setBusy(true);
          const r = await unapply(amendmentId);
          setBusy(false);
          setMsg(r.ok ? { ok: true, text: r.text ?? "완료" } : { ok: false, text: r.error });
          if (r.ok) router.refresh();
        }}
        className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
      >
        {busy ? "취소 중…" : "반영 취소"}
      </button>
      {msg && <span className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</span>}
    </div>
  );
}
