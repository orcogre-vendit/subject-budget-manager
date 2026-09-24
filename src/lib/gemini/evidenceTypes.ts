export type EvidenceDraftItem = {
  name: string;
  spec: string;
  quantity: number;
  unitPrice: string;
};

export type EvidenceDraft = {
  date: string;
  vendor: string;
  paymentMethod: "연구비카드" | "RCMS 계좌이체" | "";
  supplyAmount: number;
  vatRate: number;
  vatAmount: number;
  totalAmount: number;
  description: string;
  purpose: string;
  installLocation: string;
  budgetItemName: string;
  budgetSubItemName: string;
  budgetDetailItemName: string;
  items: EvidenceDraftItem[];
  documentTypes: { fileName: string; evidenceCode: string }[];
  inferredFields: string[];
  missingFields: string[];
  warnings: string[];
};

export type EvidenceAnalysisResponse = {
  draft?: EvidenceDraft;
  error?: string;
};
