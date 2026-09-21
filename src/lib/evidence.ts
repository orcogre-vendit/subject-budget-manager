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
  CASH_PAY_PLAN: "영리기관 현금계상 인건비 관리계획·현황(별지 3호)",
  CONTRIB_EVAL: "연구수당 기여도 평가서류",
  PAY_REQUEST: "지급신청서",
  PURCHASE_ORDER: "발주서(외부제작)",
  EQUIP_REGISTRY: "국가연구시설장비등록증",
  EQUIP_REVIEW: "장비심의 공문",
  TRAVEL_PROOF: "출장 증명 서류(여비산출내역·일정)",
  TRAINING_CERT: "교육 수료증·수납영수증",
  CONFERENCE_PROOF: "학회 참가 확인자료(등록영수증·명찰)",
  OVERTIME_PROOF: "초과근무 내역",
  LAB_PLAN: "연구실운영비 활용·관리계획(별지 4호)",
  PAPER_INFO: "논문 정보(논문명·학술지·게재일)",
  IP_REPORT: "지식재산 창출 결과보고서",
  SERVICE_REQUEST: "시험·분석 의뢰서",
  WORKER_CONFIRM: "일용직 활용 확인서",
  OTHER: "기타",
};

/**
 * 앱이 생성한 서류(GeneratedDocument.templateCode, PDF)가 그대로 증빙이 되는 경우 → 충족으로 치는 증빙 코드.
 * 품의서(PURCHASE_REQUEST)는 flex 결재가 끝난 PDF 를 첨부해야 하므로 넣지 않는다.
 */
export const DOC_TEMPLATE_EVIDENCE: Record<string, string> = {
  INSPECTION_CERT: "INSPECTION_CERT",
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
