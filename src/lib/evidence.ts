// 증빙 유형 코드 — Attachment.evidenceCode 와 EvidenceRequirement.code 가 공유하는 단일 출처

export const EVIDENCE_CODES: Record<string, string> = {
  TAX_INVOICE: "세금계산서",
  CARD_SLIP: "카드매출전표",
  STATEMENT: "거래명세서",
  PURCHASE_REQUEST: "구매의뢰서(품의서)",
  INSPECTION_CERT: "검수(설치)완료확인서",
  INSPECTION_PHOTO: "검수(납품·설치) 사진",
  IMPORT_DECL: "수입신고서류",
  DELIVERY_PROOF: "배달증명",
  MATERIAL_BREAKDOWN: "재료비 소요내역서",
  QUOTE: "견적서",
  CONTRACT: "계약서",
  INTERNAL_APPROVAL: "내부결재문서",
  RECEIPT: "집행영수증",
  ADVISORY_CONFIRM: "자문확인서",
  SERVICE_RESULT: "결과서(연구개발서비스)",
  TECH_CONTRACT: "기술도입계약서",
  USAGE_REPORT: "월별 사용량 리포트",
  MEETING_MINUTES: "회의록",
  MEETING_SUMMARY: "회의 목적·일시·장소·참석자 자료",
  TRAVEL_REQUEST: "출장신청서",
  TRAVEL_POLICY: "여비규정",
  TRAVEL_REPORT: "출장결과보고서",
  PAYSLIP: "급여명세서",
  TRANSFER_PROOF: "계좌이체증명",
  RESEARCHER_ROSTER: "참여연구자현황표",
  INSURANCE_CERT: "건강보험자격득실확인서",
  EMPLOYMENT_CONTRACT: "근로계약서",
  OTHER: "기타",
};

export function evidenceLabel(code?: string | null): string {
  if (!code) return "-";
  return EVIDENCE_CODES[code] ?? code;
}

export type ReqRow = {
  code: string;
  label: string;
  requirement: string; // required | one_of | optional
  groupKey: string | null;
};

export type ChecklistRow = ReqRow & { met: boolean };

export type Checklist = {
  rows: ChecklistRow[];
  /** 미충족 필수 항목 라벨 (one_of 그룹은 "A 또는 B" 로 합침) */
  missing: string[];
  ok: boolean;
};

/** 세목 증빙 요건 vs 첨부된 증빙 코드 → 충족 여부 평가 */
export function evaluateEvidence(reqs: ReqRow[], attachedCodes: string[]): Checklist {
  const attached = new Set(attachedCodes);
  const rows: ChecklistRow[] = reqs.map((r) => ({ ...r, met: attached.has(r.code) }));

  const missing: string[] = [];
  for (const r of rows) {
    if (r.requirement === "required" && !r.met) missing.push(r.label);
  }
  const groups = new Map<string, ChecklistRow[]>();
  for (const r of rows) {
    if (r.requirement === "one_of" && r.groupKey) {
      groups.set(r.groupKey, [...(groups.get(r.groupKey) ?? []), r]);
    }
  }
  for (const members of groups.values()) {
    if (!members.some((m) => m.met)) {
      missing.push(members.map((m) => m.label).join(" 또는 "));
    }
  }
  return { rows, missing, ok: missing.length === 0 };
}
