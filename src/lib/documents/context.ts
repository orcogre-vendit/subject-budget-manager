// Transaction(+관계) → 서류 템플릿 문맥(DocContext) 조립
import { readFile } from "fs/promises";
import path from "path";
import type { Prisma } from "@/generated/prisma/client";
import { ymd } from "@/lib/format";
import { budgetPathOf } from "@/lib/budget";
import { UPLOAD_DIR, extOf } from "@/lib/uploads";
import { sanitizeJpeg } from "@/lib/pdf/jpeg";
import { probeImage } from "@/lib/pdf/probe";
import type { DocContext, DocItem, DocPhoto } from "@/lib/templates/types";

export const INSPECTION_PHOTO_CODE = "INSPECTION_PHOTO";
export const DEFAULT_INSTALL_LOCATION = "주식회사 벤디트 기업부설연구소내";

/** 서류 생성에 필요한 include — generateDocument/페이지에서 공용 */
export const docInclude = {
  projectYear: { include: { project: true } },
  budgetItem: { select: { name: true } },
  budgetSubItem: { select: { name: true } },
  budgetDetailItem: { select: { name: true } },
  items: { orderBy: { sortOrder: "asc" as const } },
  attachments: {
    orderBy: { uploadedAt: "asc" as const },
    select: { fileName: true, storedName: true, evidenceCode: true },
  },
} satisfies Prisma.TransactionInclude;

export type TxForDoc = Prisma.TransactionGetPayload<{ include: typeof docInclude }>;

const d = (v: Date | null | undefined) => (v ? ymd(v) : "-");
const s = (v: string | null | undefined) => (v && v.trim()) || "-";

/** react-pdf <Image> 가 디코딩할 수 있는 형식 (JPEG/PNG). GIF·BMP·TIFF 는 파일명만 표기 */
const PDF_IMAGE_EXT = new Set(["jpg", "jpeg", "png"]);

/** 품목 요약: "첫 품목 외 N건" */
export function summarizeItems(items: { name: string }[], fallback?: string | null): string {
  if (!items.length) return s(fallback);
  return items.length === 1 ? items[0].name : `${items[0].name} 외 ${items.length - 1}건`;
}

/**
 * 검수 사진 첨부(INSPECTION_PHOTO)를 디스크에서 읽어 PDF 삽입용 버퍼로.
 * JPEG 는 부가 세그먼트를 걷어내고(아이폰 사진 대응), 파서를 미리 돌려 못 넣는 파일은 data:null(파일명만 표기)로 둔다.
 */
export async function loadInspectionPhotos(tx: TxForDoc): Promise<DocPhoto[]> {
  const photos = tx.attachments.filter((a) => a.evidenceCode === INSPECTION_PHOTO_CODE);
  return Promise.all(
    photos.map(async (a): Promise<DocPhoto> => {
      const ext = extOf(a.storedName);
      if (!PDF_IMAGE_EXT.has(ext)) return { caption: a.fileName, data: null };
      try {
        const raw = await readFile(path.join(UPLOAD_DIR, a.storedName));
        const data = ext === "png" ? raw : sanitizeJpeg(raw);
        return { caption: a.fileName, data: (await probeImage(data)) ? data : null };
      } catch {
        return { caption: a.fileName, data: null }; // 디스크에서 유실된 파일
      }
    }),
  );
}

export function buildDocContext(tx: TxForDoc, opts: { photos?: DocPhoto[]; now?: Date } = {}): DocContext {
  const now = opts.now ?? new Date();
  const project = tx.projectYear.project;
  const items: DocItem[] = tx.items.map((it) => ({
    name: it.name,
    spec: it.spec ?? "",
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    amount: it.amount,
  }));
  const person = s(project.managerName ?? project.piName);
  const isCard = tx.paymentMethod === "연구비카드";
  const txDate = tx.date;

  return {
    project: { code: s(project.code), name: project.name, short: s(project.code) },
    budgetPath: budgetPathOf(tx.budgetItem?.name, tx.budgetSubItem?.name, tx.budgetDetailItem?.name),
    subItemName: s(tx.budgetSubItem?.name),
    items,
    itemSummary: summarizeItems(items, tx.description),

    supplyAmount: tx.amount,
    vatAmount: tx.vatAmount,
    totalAmount: tx.amount + tx.vatAmount,

    purpose: s(tx.purpose ?? tx.description),
    vendor: s(tx.vendor),
    vendorBank: s(tx.vendorBank),
    vendorAccount: s(tx.vendorAccount),
    vendorHolder: s(tx.vendorHolder),
    paymentMethod: s(tx.paymentMethod ?? "RCMS 계좌이체"),
    purchaseDate: d(txDate),
    invoiceDate: d(txDate),
    deliveryDate: d(tx.deliveryDate),
    inspectionDate: d(tx.inspectionDate),
    installLocation: s(tx.installLocation ?? DEFAULT_INSTALL_LOCATION),
    paymentDueDate: d(tx.paymentDueDate),

    requester: person,
    inspector: person,
    contact: person,

    today: ymd(now),
    yy: String(txDate.getFullYear() % 100).padStart(2, "0"),
    m: String(txDate.getMonth() + 1),

    evidenceType: isCard ? "연구비카드 사용내역" : "전자세금계산서",
    evidenceLookup: isCard ? "카드 사용내역 조회 → 해당 승인건 선택" : "세금계산서 조회 → 해당 건 선택",

    photos: opts.photos ?? [],
    attachments: tx.attachments.map((a) => ({ name: a.fileName, code: a.evidenceCode })),
  };
}
