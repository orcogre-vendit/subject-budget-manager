"use client";

import { useState } from "react";

import { downloadHref } from "@/lib/download";

export type GeneratedDoc = {
  id: number;
  templateCode: string;
  format: string; // text | pdf
  content: string | null;
  createdAt: string; // YYYY-MM-DD HH:mm
  fileName: string; // PDF 저장 이름 (연번-서류-거래처-비목.pdf)
};

const LABELS: Record<string, string> = {
  PURCHASE_REQUEST: "품의서 (텍스트·flex 복붙)",
  PURCHASE_REQUEST_PDF: "품의서 (PDF)",
  INSPECTION_CERT: "검수(설치)완료확인서 (PDF·검수 사진 포함)",
  EXPENSE_REPORT: "지출결의 본문 — 연구비(공급가액)",
  EXPENSE_REPORT_VAT: "지출결의 본문 — 부가세(회사 자금)",
};

type Action = (fd: FormData) => void | Promise<void>;

/**
 * 거래 서류 생성 패널 — 세목 증빙요건(requiredCodes)에 따라 필요한 서류 버튼만 노출.
 * 텍스트 서류는 모달로 표시 + [복사], PDF는 다운로드 링크.
 */
export default function DocumentsPanel({
  transactionId,
  projectId,
  projectYearId,
  direction,
  hasVat,
  requiredCodes,
  photoCount = 0,
  hasInspectionDate = true,
  docs,
  generate,
  remove,
}: {
  transactionId: number;
  projectId: number;
  projectYearId: number;
  direction: string;
  hasVat: boolean;
  requiredCodes: string[];
  /** 검수 사진(INSPECTION_PHOTO) 첨부 수 — 0이면 검수확인서를 발급하지 않는다 */
  photoCount?: number;
  /** 검수일 입력 여부 — 없어도 발급은 되지만 경고 */
  hasInspectionDate?: boolean;
  docs: GeneratedDoc[];
  generate: Action;
  remove: Action;
}) {
  const [open, setOpen] = useState<GeneratedDoc | null>(null);
  const [copied, setCopied] = useState(false);

  const isOut = direction === "OUT";
  const noReqs = requiredCodes.length === 0;
  const buttons: string[] = [];
  // 품의서는 flex 결재용 텍스트만 — 결재가 끝나면 flex 가 만든 PDF 를 받아 증빙으로 첨부한다 (자체 PDF 는 만들지 않음)
  if (isOut && (noReqs || requiredCodes.includes("PURCHASE_REQUEST"))) buttons.push("PURCHASE_REQUEST");
  if (isOut && (noReqs || requiredCodes.includes("INSPECTION_CERT"))) buttons.push("INSPECTION_CERT");
  if (isOut) buttons.push("EXPENSE_REPORT");
  if (isOut && hasVat) buttons.push("EXPENSE_REPORT_VAT");

  const hidden = (
    <>
      <input type="hidden" name="transactionId" value={transactionId} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="projectYearId" value={projectYearId} />
    </>
  );

  const copy = async () => {
    if (!open?.content) return;
    try {
      await navigator.clipboard.writeText(open.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard 미지원 시 사용자가 직접 선택·복사 */
    }
  };

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900">서류 생성</h2>
      {!isOut ? (
        <p className="mt-2 text-sm text-slate-400">입금(예산 편성) 거래는 생성할 서류가 없습니다.</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {buttons.map((code) => {
            const blocked = code === "INSPECTION_CERT" && photoCount === 0;
            return (
              <form key={code} action={generate}>
                {hidden}
                <input type="hidden" name="templateCode" value={code} />
                <button
                  type="submit"
                  disabled={blocked}
                  title={blocked ? "검수 사진을 먼저 첨부해야 발급됩니다" : undefined}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
                >
                  {LABELS[code]}
                  {code === "INSPECTION_CERT" && photoCount > 0 && (
                    <span className="ml-1 text-xs text-slate-400">사진 {photoCount}장</span>
                  )}
                </button>
              </form>
            );
          })}
        </div>
      )}
      {isOut && buttons.includes("PURCHASE_REQUEST") && (
        <p className="mt-2 text-xs text-slate-500">
          ※ 품의서 텍스트를 flex 에 올려 결재받은 뒤, flex 에서 내려받은 결재 완료 PDF 를 증빙 <b>구매의뢰서(품의서)</b>로 첨부하세요. 지출결의 PDF 는 <b>내부결재문서</b>로.
        </p>
      )}
      {isOut && buttons.includes("INSPECTION_CERT") && (
        photoCount === 0 ? (
          <p className="mt-2 text-xs text-amber-700">
            ⚠️ 검수확인서는 <b>검수(납품·설치) 사진</b>이 최소 1장 첨부돼야 발급됩니다. 아래 증빙에 사진(JPG/PNG)을 올리고 유형을 &quot;검수(납품·설치) 사진&quot;으로 고르세요.
          </p>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            ※ 검수확인서에 검수 사진 {photoCount}장이 붙임 페이지로 들어갑니다.
            {!hasInspectionDate && <span className="ml-1 text-amber-700">검수일이 비어 있어 확인서에 &quot;-&quot;로 찍힙니다. 위 폼에서 검수일을 넣고 저장하세요.</span>}
          </p>
        )
      )}
      {isOut && hasVat && (
        <p className="mt-2 text-xs text-amber-700">
          ※ 부가세가 있어 지출결의는 <b>연구비(RCMS)</b>·<b>부가세(회사 계좌)</b> 2건으로 나눠 생성합니다.
        </p>
      )}

      {docs.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2.5">
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  d.format === "pdf" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                }`}
              >
                {d.format.toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{LABELS[d.templateCode] ?? d.templateCode}</p>
                <p className="text-xs text-slate-400">{d.createdAt}</p>
              </div>
              {d.format === "pdf" ? (
                <span className="flex items-center gap-2">
                  <a
                    href={downloadHref(`/api/documents/${d.id}`, d.fileName)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-slate-700 hover:underline"
                  >
                    보기
                  </a>
                  <a
                    href={downloadHref(`/api/documents/${d.id}`, d.fileName, true)}
                    download={d.fileName}
                    className="text-xs font-medium text-slate-700 hover:underline"
                  >
                    다운로드
                  </a>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => { setCopied(false); setOpen(d); }}
                  className="text-xs font-medium text-slate-700 hover:underline"
                >
                  보기/복사
                </button>
              )}
              <form
                action={remove}
                onSubmit={(e) => { if (!window.confirm("이 서류를 삭제하시겠습니까?")) e.preventDefault(); }}
              >
                {hidden}
                <input type="hidden" name="id" value={d.id} />
                <button type="submit" className="text-xs font-medium text-red-600 hover:underline">삭제</button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(null)}>
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <h3 className="text-sm font-semibold text-slate-900">{LABELS[open.templateCode] ?? open.templateCode}</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copy}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
                >
                  {copied ? "복사됨 ✓" : "복사"}
                </button>
                <button type="button" onClick={() => setOpen(null)} className="rounded-lg px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100">닫기</button>
              </div>
            </div>
            <pre className="overflow-auto whitespace-pre-wrap px-5 py-4 font-mono text-xs leading-relaxed text-slate-800">{open.content}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
