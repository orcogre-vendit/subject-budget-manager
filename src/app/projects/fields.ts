// 과제 폼/검증/표시 공용 필드 정의 (단일 출처)
export type ProjectFieldType =
  | "text"
  | "date"
  | "number"
  | "checkbox"
  | "select";

export interface ProjectField {
  key: string;
  label: string;
  type?: ProjectFieldType; // 기본 text
  required?: boolean;
  advanced?: boolean; // 접기식 상세정보 섹션
  placeholder?: string;
  options?: string[]; // select
  suffix?: string; // 단위 표시 (%, 원 등)
  money?: boolean; // 금액 입력(3자리 콤마)
  full?: boolean; // 한 줄 전체 차지
}

export const PROJECT_STATUS_OPTIONS = ["준비", "진행", "완료", "중단"];

export const PROJECT_FIELDS: ProjectField[] = [
  // 핵심 (항상 노출)
  { key: "code", label: "과제번호", placeholder: "예: 2018-0015" },
  { key: "status", label: "진행상태", type: "select", options: PROJECT_STATUS_OPTIONS },
  { key: "name", label: "과제명", required: true, full: true },
  { key: "businessName", label: "사업명", full: true },
  { key: "piName", label: "연구책임" },
  { key: "managerName", label: "과제담당" },
  { key: "fundingAgency", label: "지원기관" },
  { key: "active", label: "사용 중(USE_YN)", type: "checkbox" },
  { key: "startDate", label: "연구시작일", type: "date" },
  { key: "endDate", label: "연구종료일", type: "date" },

  // 상세 (접기식)
  { key: "hostOrg", label: "주관연구기관", advanced: true, full: true },
  { key: "indirectRate", label: "간접징수비율", type: "number", suffix: "%", advanced: true },
  { key: "region", label: "수행지역", advanced: true },
  { key: "cardType", label: "카드구분", advanced: true },
  { key: "category", label: "과제구분", advanced: true },
  { key: "classification", label: "과제분류", advanced: true },
  { key: "researchType", label: "연구형태", advanced: true },
  { key: "managementGroup", label: "관리그룹", advanced: true },
];

// 연차(ProjectYear) 폼 필드
export const PROJECT_YEAR_FIELDS: ProjectField[] = [
  { key: "yearNo", label: "연차", type: "number", required: true, placeholder: "예: 1" },
  { key: "label", label: "표시 라벨", placeholder: "예: ITRC3년차" },
  { key: "fiscalYear", label: "회계연도", type: "number", placeholder: "예: 2018" },
  { key: "budgetCash", label: "당해연구현금(예산)", type: "number", suffix: "원", money: true },
  { key: "startDate", label: "시작일", type: "date" },
  { key: "endDate", label: "종료일", type: "date" },
];

