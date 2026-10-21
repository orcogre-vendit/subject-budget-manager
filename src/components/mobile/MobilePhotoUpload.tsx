"use client";

// 모바일 사진 올리기 — 카메라로 찍거나 앨범에서 골라 바로 거래 증빙으로 붙인다.
// 사진은 줄여서(긴 변 2560px) S3 staging 에 올린 뒤, 데스크톱과 같은 uploadAttachments 액션으로 거래에 붙인다.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EVIDENCE_CODES } from "@/lib/evidence";
import { ALLOWED_EXT, MAX_UPLOAD_BYTES, extOf, normalizeFileName } from "@/lib/uploadRules";
import { uploadToStaging } from "@/lib/upload-client";
import { preparePhoto } from "@/lib/image-client";
import type { FormState } from "@/app/projects/actions";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

/** 휴대폰에서 자주 올리는 증빙 — 앞쪽에 보여 준다 */
const QUICK = ["INSPECTION_PHOTO", "CARD_SLIP", "STATEMENT", "RECEIPT", "TAX_INVOICE", "QUOTE", "BANK_COPY", "OTHER"];

type Row = { name: string; state: "준비" | "올리는 중" | "완료" | "실패"; note?: string };

export default function MobilePhotoUpload({
  action,
  transactionId,
  projectId,
  projectYearId,
  suggestedCodes = [],
}: {
  action: Action;
  transactionId: string;
  projectId: string;
  projectYearId: string;
  suggestedCodes?: string[];
}) {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("INSPECTION_PHOTO");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const order = [...new Set([...QUICK, ...suggestedCodes, ...Object.keys(EVIDENCE_CODES)])].filter((c) => EVIDENCE_CODES[c]);

  const run = async (list: FileList | null) => {
    if (!list || !list.length || busy) return;
    const files = [...list];
    setBusy(true);
    setMessage(null);
    setRows(files.map((f) => ({ name: f.name, state: "준비" })));
    const set = (i: number, r: Partial<Row>) => setRows((prev) => prev.map((x, k) => (k === i ? { ...x, ...r } : x)));

    const fd = new FormData();
    fd.set("transactionId", transactionId);
    fd.set("projectId", projectId);
    fd.set("projectYearId", projectYearId);
    let okCount = 0;
    for (let i = 0; i < files.length; i++) {
      set(i, { state: "올리는 중" });
      try {
        const small = await preparePhoto(files[i]); // HEIC → JPG, 긴 변 2560px
        const name = normalizeFileName(small.name);
        if (!ALLOWED_EXT.has(extOf(name))) throw new Error("허용되지 않는 형식");
        if (small.size > MAX_UPLOAD_BYTES) throw new Error("20MB 초과");
        const staged = await uploadToStaging(small);
        fd.append("evidenceKey", staged.key);
        fd.append("evidenceName", staged.name);
        fd.append("evidenceType", staged.type);
        fd.append("evidenceSize", String(staged.size));
        fd.append("evidenceCode", code);
        set(i, { state: "완료", note: small !== files[i] ? `${Math.round(small.size / 1024)}KB 로 줄임` : undefined });
        okCount++;
      } catch (e) {
        set(i, { state: "실패", note: e instanceof Error ? e.message : "업로드 실패" });
      }
    }

    if (okCount) {
      const res = await action({}, fd);
      if (res.error || res.fieldErrors) {
        setMessage({ ok: false, text: res.error ?? Object.values(res.fieldErrors ?? {})[0] ?? "저장하지 못했습니다." });
      } else {
        setMessage({ ok: true, text: `${okCount}장을 "${EVIDENCE_CODES[code]}"(으)로 붙였습니다.` });
        router.refresh();
      }
    } else {
      setMessage({ ok: false, text: "올린 사진이 없습니다." });
    }
    setBusy(false);
    if (cameraRef.current) cameraRef.current.value = "";
    if (albumRef.current) albumRef.current.value = "";
  };

  return (
    <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
      <h2 className="text-base font-bold text-slate-900">사진 올리기</h2>
      <label className="mt-3 block text-sm font-medium text-slate-700">
        증빙 종류
        <select
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={busy}
          className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base"
        >
          {order.map((c) => (
            <option key={c} value={c}>{EVIDENCE_CODES[c]}</option>
          ))}
        </select>
      </label>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => cameraRef.current?.click()}
          className="rounded-xl bg-blue-600 px-4 py-4 text-base font-bold text-white active:bg-blue-700 disabled:opacity-50"
        >
          📷 사진 찍기
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => albumRef.current?.click()}
          className="rounded-xl border border-blue-300 bg-white px-4 py-4 text-base font-bold text-blue-700 active:bg-blue-100 disabled:opacity-50"
        >
          🖼️ 앨범에서
        </button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => run(e.target.files)} />
      <input ref={albumRef} type="file" accept="image/*,image/heic,image/heif,.heic,.heif,application/pdf" multiple className="hidden" onChange={(e) => run(e.target.files)} />

      {rows.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2">
              <span className="min-w-0 truncate text-slate-700">{r.name}</span>
              <span
                className={`shrink-0 text-xs font-semibold ${
                  r.state === "완료" ? "text-green-700" : r.state === "실패" ? "text-red-600" : "text-blue-600"
                }`}
              >
                {r.state}
                {r.note ? ` · ${r.note}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {message && (
        <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${message.ok ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}>
          {message.text}
        </p>
      )}
      <p className="mt-2 text-xs text-slate-500">사진은 자동으로 줄여서 올립니다. 이름은 &quot;연번-종류-거래처-비목&quot; 규칙으로 붙습니다.</p>
    </section>
  );
}
