"use client";

import { evaluateEvidence, type ChecklistRow, type ReqRow } from "@/lib/evidence";

const REQ_LABEL: Record<string, string> = { required: "필수", one_of: "택1", optional: "선택" };

function Chip({ r }: { r: ChecklistRow }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
        r.met ? "border-green-300 bg-green-50 text-green-700" : "border-slate-300 bg-white text-slate-600"
      }`}
    >
      {r.met ? "✅" : "☐"} {r.label}
    </span>
  );
}

/**
 * 세목을 고르면 그 세목의 증빙 요건을 필수 / 택1 / 선택으로 나눠 보여주고,
 * 드롭존에 올린 파일의 유형과 대조해 충족 여부를 표시한다 (저장 전 미리보기).
 */
export default function EvidenceReqPanel({
  subName,
  reqs,
  attachedCodes,
}: {
  subName?: string;
  reqs: ReqRow[];
  attachedCodes: string[];
}) {
  if (!subName) return <p className="mt-4 text-xs text-slate-400">세목을 고르면 필요한 증빙이 여기에 표시됩니다.</p>;
  if (!reqs.length)
    return <p className="mt-4 text-xs text-slate-400">&quot;{subName}&quot; 세목에는 등록된 증빙 요건이 없습니다. 기준정보에서 추가할 수 있습니다.</p>;

  const { rows, missing, ok } = evaluateEvidence(reqs, attachedCodes);
  const required = rows.filter((r) => r.requirement === "required");
  const optional = rows.filter((r) => r.requirement === "optional");
  const groups = new Map<string, ChecklistRow[]>();
  for (const r of rows) {
    if (r.requirement !== "one_of") continue;
    const k = r.groupKey ?? r.code;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-700">
          필요 증빙 <span className="text-xs font-normal text-slate-400">({subName})</span>
        </p>
        <span
          className={`rounded px-2 py-0.5 text-xs font-semibold ${
            ok ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"
          }`}
        >
          {ok ? "필수 증빙 충족" : `미첨부: ${missing.join(", ")}`}
        </span>
      </div>

      <div className="mt-2 space-y-1.5 text-xs">
        {required.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-8 rounded bg-red-100 px-1.5 py-0.5 text-center text-[10px] font-semibold text-red-700">{REQ_LABEL.required}</span>
            {required.map((r) => <Chip key={r.code} r={r} />)}
          </div>
        )}
        {[...groups.entries()].map(([k, members]) => (
          <div key={k} className="flex flex-wrap items-center gap-1.5">
            <span className="w-8 rounded bg-amber-100 px-1.5 py-0.5 text-center text-[10px] font-semibold text-amber-700">{REQ_LABEL.one_of}</span>
            {members.map((r, i) => (
              <span key={r.code} className="inline-flex items-center gap-1.5">
                {i > 0 && <span className="text-slate-400">또는</span>}
                <Chip r={r} />
              </span>
            ))}
          </div>
        ))}
        {optional.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-8 rounded bg-slate-100 px-1.5 py-0.5 text-center text-[10px] font-semibold text-slate-500">{REQ_LABEL.optional}</span>
            {optional.map((r) => <Chip key={r.code} r={r} />)}
          </div>
        )}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">품의서·검수확인서는 저장 후 &quot;서류 생성&quot;으로 만들어 증빙에 붙일 수 있습니다.</p>
    </div>
  );
}
