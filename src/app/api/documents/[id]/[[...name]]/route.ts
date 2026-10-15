// 생성 서류(PDF) 다운로드 — GeneratedDocument.filePath 는 S3 키(generated/{txId}/…). presigned GET 으로 리다이렉트.
// URL: /api/documents/{id} 또는 /api/documents/{id}/02-검수완료확인서-….pdf (뒤 조각은 저장 파일명용, 조회는 id 로만)
import { prisma } from "@/lib/prisma";
import { idOf } from "@/lib/ids";
import { GENERATED_PREFIX, presignGet } from "@/lib/storage";
import { documentFileName, DOC_FILE_LABELS } from "@/lib/evidenceName";
import { wantsDownload } from "@/lib/download";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; name?: string[] }> },
) {
  const { id } = await params;
  const docId = idOf(id);
  if (!docId) return new Response("Bad request", { status: 400 });

  const doc = await prisma.generatedDocument.findUnique({
    where: { id: docId },
    include: { transaction: { select: { seqNo: true, vendor: true, budgetItem: { select: { name: true } } } } },
  });
  if (!doc || doc.format !== "pdf" || !doc.filePath) return new Response("Not found", { status: 404 });
  if (!doc.filePath.startsWith(GENERATED_PREFIX)) return new Response("Forbidden", { status: 403 });

  // 거래 서류는 첨부와 같은 규칙 "연번-서류-거래처-비목.pdf", 연차 서류(대비표)는 기존 이름
  const base = DOC_FILE_LABELS[doc.templateCode] ?? doc.templateCode;
  const t = doc.transaction;
  const fileName = t
    ? documentFileName({ seqNo: t.seqNo, vendor: t.vendor, budgetItem: t.budgetItem?.name ?? null }, base)
    : `${base}_${doc.projectYearId ?? doc.id}.pdf`;
  const url = await presignGet(doc.filePath, { fileName, download: wantsDownload(req), contentType: "application/pdf" });
  return Response.redirect(url, 302);
}
