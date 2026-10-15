// 증빙 첨부 다운로드 — URL: /api/attachments/{id} 또는 /api/attachments/{id}/02-검수사진-….jpg (뒤 조각은 저장 파일명용, 조회는 id 로만)
// 파일은 S3 에 있고 Lambda 응답 한도(6MB)가 있어 presigned GET 으로 리다이렉트한다. 파일명·inline/attachment 는 S3 응답 헤더로 강제.
import { prisma } from "@/lib/prisma";
import { idOf } from "@/lib/ids";
import { presignGet } from "@/lib/storage";
import { wantsDownload } from "@/lib/download";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; name?: string[] }> },
) {
  const { id } = await params;
  const attId = idOf(id);
  if (!attId) return new Response("Bad request", { status: 400 });

  const att = await prisma.attachment.findUnique({ where: { id: attId } });
  if (!att) return new Response("Not found", { status: 404 });

  const url = await presignGet(att.storedName, {
    fileName: att.fileName,
    download: wantsDownload(req),
    contentType: att.mimeType,
  });
  return Response.redirect(url, 302);
}
