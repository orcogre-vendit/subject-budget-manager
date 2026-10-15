// 파일 저장소 — S3. 증빙 첨부(attachments/UUID.ext), 생성 PDF(generated/{txId}/…), 브라우저 직접 업로드 임시(staging/UUID.ext).
// Lambda 는 요청·응답이 6MB 로 제한되므로 업로드는 브라우저→S3 presigned PUT, 다운로드는 presigned GET 리다이렉트로 처리한다.
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { contentDisposition } from "./download";

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-northeast-2";
let client: S3Client | undefined;
function s3(): S3Client {
  return (client ??= new S3Client({ region }));
}

export function bucket(): string {
  const b = process.env.FILES_BUCKET?.trim();
  if (!b) throw new Error("FILES_BUCKET 이 설정되지 않았습니다.");
  return b;
}

export const STAGING_PREFIX = "staging/";
export const ATTACHMENT_PREFIX = "attachments/";
export const GENERATED_PREFIX = "generated/";

export async function putObject(key: string, body: Buffer, contentType?: string): Promise<void> {
  await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
}

async function toBuffer(body: unknown): Promise<Buffer> {
  const b = body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
  if (!b?.transformToByteArray) throw new Error("S3 응답 본문이 비어 있습니다.");
  return Buffer.from(await b.transformToByteArray());
}

export async function getObject(key: string): Promise<Buffer> {
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  return toBuffer(res.Body);
}

/** 바이트 범위만 읽기 (PDF 암호화 검사처럼 머리·꼬리만 볼 때). range 는 "bytes=0-4095" 형식 */
export async function getObjectRange(key: string, range: string): Promise<Buffer> {
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key, Range: range }));
  return toBuffer(res.Body);
}

export async function headObject(key: string): Promise<{ size: number; contentType: string | null } | null> {
  try {
    const res = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? null };
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === "NotFound" || name === "NoSuchKey") return null;
    throw e;
  }
}

export async function deleteObject(key: string): Promise<void> {
  try {
    await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  } catch {
    // 이미 없으면 무시
  }
}

export async function copyObject(from: string, to: string, contentType?: string): Promise<void> {
  await s3().send(
    new CopyObjectCommand({
      Bucket: bucket(),
      CopySource: `${bucket()}/${encodeURIComponent(from).replace(/%2F/g, "/")}`,
      Key: to,
      ...(contentType ? { ContentType: contentType, MetadataDirective: "REPLACE" } : {}),
    }),
  );
}

/** 브라우저가 직접 올릴 presigned PUT URL (5분). Content-Type·크기는 서명에 묶여 다른 값으로는 못 올린다 */
export async function presignPut(key: string, contentType: string, contentLength: number): Promise<string> {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType, ContentLength: contentLength }),
    { expiresIn: 300 },
  );
}

/** 다운로드·미리보기용 presigned GET (5분). 파일명·inline/attachment 는 응답 헤더로 강제 */
export async function presignGet(
  key: string,
  opts: { fileName: string; download: boolean; contentType?: string | null },
): Promise<string> {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentDisposition: contentDisposition(opts.fileName, opts.download),
      ResponseContentType: opts.contentType || "application/octet-stream",
      ResponseCacheControl: "private, max-age=0, must-revalidate",
    }),
    { expiresIn: 300 },
  );
}
