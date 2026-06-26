import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { UPLOAD_DIR } from "@/lib/uploads";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
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

  // 한글 파일명 지원(RFC 5987), 이미지·PDF는 브라우저 미리보기(inline)
  const encoded = encodeURIComponent(att.fileName);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": att.mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${encoded}`,
      "Content-Length": String(att.size),
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
