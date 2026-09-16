// 증빙 첨부 다운로드 — URL: /api/attachments/26 또는 /api/attachments/26/02-검수사진-….jpg (뒤 조각은 저장 파일명용, 조회는 id 로만)
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { UPLOAD_DIR } from "@/lib/uploads";
import { contentDisposition, wantsDownload } from "@/lib/download";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; name?: string[] }> },
) {
  const { id } = await params;
  const attId = Number(id);
  if (!attId) return new Response("Bad request", { status: 400 });

  const att = await prisma.attachment.findUnique({ where: { id: attId } });
  if (!att) return new Response("Not found", { status: 404 });

  let data: Buffer;
  try {
    data = await readFile(path.join(UPLOAD_DIR, att.storedName));
  } catch {
    return new Response("File missing", { status: 404 });
  }

  // 이미지·PDF 는 기본 미리보기(inline), ?download=1 이면 저장. 파일명은 규칙 이름(연번-종류-거래처-비목.ext)
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": att.mimeType || "application/octet-stream",
      "Content-Disposition": contentDisposition(att.fileName, wantsDownload(req)),
      "Content-Length": String(data.length),
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
