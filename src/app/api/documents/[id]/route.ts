// 생성 서류(PDF) 다운로드 — GeneratedDocument.filePath 는 UPLOAD_DIR 기준 상대경로
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { UPLOAD_DIR } from "@/lib/uploads";
import { documentFileName } from "@/lib/evidenceName";

export const dynamic = "force-dynamic";

const FILE_NAMES: Record<string, string> = {
  PURCHASE_REQUEST_PDF: "품의서",
  INSPECTION_CERT: "검수완료확인서",
  BUDGET_DIFF: "예산대비표",
  RESEARCHER_DIFF: "연구원인건비대비표",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
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
  const base = FILE_NAMES[doc.templateCode] ?? doc.templateCode;
  const t = doc.transaction;
  const filename = encodeURIComponent(
    t
      ? documentFileName({ seqNo: t.seqNo, vendor: t.vendor, budgetItem: t.budgetItem?.name ?? null }, base)
      : `${base}_${doc.projectYearId ?? doc.id}.pdf`,
  );
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${filename}`,
      "Content-Length": String(data.length),
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
