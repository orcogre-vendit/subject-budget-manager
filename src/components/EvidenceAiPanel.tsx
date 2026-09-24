"use client";

import { useState } from "react";
import EvidenceDropInput, { type PickedEvidence } from "@/components/EvidenceDropInput";
import type { NamingContext } from "@/lib/evidenceName";
import type { EvidenceAnalysisResponse, EvidenceDraft } from "@/lib/gemini/evidenceTypes";
import { extOf } from "@/lib/uploadRules";

const AI_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png", "tif", "tiff"]);

export default function EvidenceAiPanel({
  projectYearId,
  naming,
  onCodesChange,
  onApply,
  error,
}: {
  projectYearId: number;
  naming: NamingContext;
  onCodesChange: (codes: string[]) => void;
  onApply: (draft: EvidenceDraft) => void;
  error?: string;
}) {
  const [picked, setPicked] = useState<PickedEvidence[]>([]);
  const [pending, setPending] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [draft, setDraft] = useState<EvidenceDraft | null>(null);

  const validFiles = picked
    .filter((item) => !item.problem && AI_EXTENSIONS.has(extOf(item.file.name)))
    .map((item) => item.file);
  const unsupportedCount = picked.filter(
    (item) => !item.problem && !AI_EXTENSIONS.has(extOf(item.file.name)),
  ).length;

  const analyze = async () => {
    if (!validFiles.length || pending) return;
    setPending(true);
    setAnalysisError("");
    try {
      const fd = new FormData();
      fd.set("projectYearId", String(projectYearId));
      validFiles.forEach((file) => fd.append("files", file));
      const response = await fetch("/api/evidence/analyze", { method: "POST", body: fd });
      const result = await response.json() as EvidenceAnalysisResponse;
      if (!response.ok || !result.draft) throw new Error(result.error || "증빙을 분석하지 못했습니다.");
      setDraft(result.draft);
      onApply(result.draft);
    } catch (cause) {
      setAnalysisError(cause instanceof Error ? cause.message : "증빙 분석 중 오류가 발생했습니다.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">증빙으로 자동 입력</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            견적서·거래명세서·카드영수증을 먼저 올리면 Gemini 3.8 Flash가 품목과 금액을 읽어 아래 입력란을 채웁니다.
          </p>
        </div>
        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-blue-700 ring-1 ring-blue-200">저장 전 검토 필수</span>
      </div>

      <EvidenceDropInput
        suggestedCodes={["QUOTE", "STATEMENT", "CARD_SLIP", "TAX_INVOICE", "RECEIPT"]}
        error={error}
        title="증빙 먼저 올리기"
        hint="(PDF·사진을 함께 올리면 서로 대조합니다)"
        onCodesChange={onCodesChange}
        onSelectionChange={setPicked}
        naming={naming}
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={analyze}
          disabled={!validFiles.length || pending}
          className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "PDF·OCR 분석 중…" : "AI로 읽고 자동 입력"}
        </button>
        <p className="text-xs text-slate-500">
          {validFiles.length ? `${validFiles.length}개 파일 분석 대기` : "분석할 PDF 또는 이미지를 올려주세요."}
        </p>
        {unsupportedCount > 0 && (
          <p className="text-xs text-amber-700">문서 파일 {unsupportedCount}개는 첨부만 하고 AI 분석에서는 제외합니다.</p>
        )}
      </div>

      {analysisError && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{analysisError}</p>}
      {draft && (
        <div className="mt-3 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm">
          <p className="font-medium text-green-700">자동 입력 완료 — 아래 내용을 확인한 뒤 거래를 등록하세요.</p>
          <p className="mt-1 text-xs text-slate-500">
            공급가액 {draft.supplyAmount.toLocaleString("ko-KR")}원 · VAT {draft.vatAmount.toLocaleString("ko-KR")}원 · 총액 {draft.totalAmount.toLocaleString("ko-KR")}원 · 품목 {draft.items.length}건
          </p>
          {draft.inferredFields.length > 0 && (
            <p className="mt-2 text-xs text-amber-700">기존 입력 이력으로 추정: {draft.inferredFields.join(", ")}</p>
          )}
          {draft.warnings.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-amber-700">
              {draft.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}
            </ul>
          )}
          {draft.missingFields.length > 0 && (
            <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-800">
              직접 작성 필요: {draft.missingFields.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
