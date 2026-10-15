// 브라우저 직접 업로드용 presigned PUT 발급 — staging/UUID.ext 로 올리고, 거래 저장 시 서버가 attachments/ 로 옮긴다.
// staging/ 은 S3 수명주기로 1일 뒤 자동 삭제되므로 폼을 안 보낸 파일이 남지 않는다.
import { NextResponse } from "next/server";
import { ALLOWED_EXT, MAX_UPLOAD_BYTES, extOf, normalizeFileName } from "@/lib/uploadRules";
import { STAGING_PREFIX, presignPut } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { name?: unknown; size?: unknown; type?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const name = normalizeFileName(typeof body.name === "string" ? body.name : "");
  const size = Number(body.size);
  const type = typeof body.type === "string" && body.type ? body.type : "application/octet-stream";
  if (!name || !Number.isFinite(size) || size <= 0) return NextResponse.json({ error: "파일 정보가 없습니다." }, { status: 400 });
  if (size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: `'${name}' 은(는) 20MB 를 넘습니다.` }, { status: 400 });
  const ext = extOf(name);
  if (!ALLOWED_EXT.has(ext)) return NextResponse.json({ error: `'${name}' 형식은 허용되지 않습니다. (PDF·이미지·오피스·HWP)` }, { status: 400 });

  const key = `${STAGING_PREFIX}${crypto.randomUUID()}.${ext}`;
  const url = await presignPut(key, type, size);
  return NextResponse.json({ key, url, name, type, size });
}
