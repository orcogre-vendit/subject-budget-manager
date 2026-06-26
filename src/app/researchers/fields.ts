// 연구원 폼/검증/표시에서 공용으로 쓰는 필드 정의 (단일 출처)
export type FieldType = "text" | "email" | "textarea";

export interface ResearcherField {
  key: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  sensitive?: boolean; // 목록에서 마스킹
  placeholder?: string;
  full?: boolean; // 폼에서 한 줄 전체 차지
}

export const RESEARCHER_FIELDS: ResearcherField[] = [
  { key: "name", label: "이름", required: true },
  { key: "employeeNo", label: "학번/사번" },
  { key: "title", label: "직책", placeholder: "예: 일반연구원" },
  { key: "affiliation", label: "소속", full: true },
  { key: "email", label: "이메일", type: "email" },
  { key: "phone", label: "전화번호" },
  { key: "workPhone", label: "직장전화번호" },
  { key: "sciTechNo", label: "과학기술인번호" },
  { key: "researcherRegNo", label: "연구자등록번호" },
  { key: "ssn", label: "주민등록번호", sensitive: true },
  { key: "bankName", label: "은행명" },
  { key: "accountNo", label: "계좌번호", sensitive: true },
  { key: "homeAddress", label: "집주소", type: "textarea", full: true },
  { key: "workAddress", label: "직장주소", type: "textarea", full: true },
];
