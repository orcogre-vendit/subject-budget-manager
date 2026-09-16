// 생성 서류(PDF) 다운로드 — GeneratedDocument.filePath 는 UPLOAD_DIR 기준 상대경로.
// URL: /api/documents/17 또는 /api/documents/17/02-검수완료확인서-….pdf (뒤 조각은 저장 파일명용, 조회는 id 로만)
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { UPLOAD_DIR } from "@/lib/uploads";
import { documentFileName, DOC_FILE_LABELS } from "@/lib/evidenceName";
import { contentDisposition, wantsDownload } from "@/lib/download";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; name?: string[] }> },
) {
  const { id } = await params;
  const docId = Number(id);
  if (!docId) return new Response("Bad request", { status: 400 });

  const doc = await prisma.generatedDocument.findUnique({
    where: { id: docId },
    include: { transaction: { select: { seqNo: true, vendor: true, budgetItem: { select: { name: true } } } } },
  });
  if (!doc || doc.format !== "pdf" || !doc.filePath)
    return new Response("Not found", { status: 404 });

  // 경로 탈출 방지: UPLOAD_DIR 하위만 허용
  const abs = path.resolve(UPLOAD_DIR, doc.filePath);
  if (!abs.startsWith(path.resolve(UPLOAD_DIR) + path.sep))
    return new Response("Forbidden", { status: 403 });

  let data: Buffer;
  try {
    data = await readFile(abs);
  } catch {
    return new Response("File missing", { status: 404 });
  }

  // 거래 서류는 첨부와 같은 규칙 "연번-서류-거래처-비목.pdf", 연차 서류(대비표)는 기존 이름
  const base = DOC_FILE_LABELS[doc.templateCode] ?? doc.templateCode;
  const t = doc.transaction;
  const fileName = t
    ? documentFileName({ seqNo: t.seqNo, vendor: t.vendor, budgetItem: t.budgetItem?.name ?? null }, base)
    : `${base}_${doc.projectYearId ?? doc.id}.pdf`;
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition(fileName, wantsDownload(req)),
      "Content-Length": String(data.length),
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
