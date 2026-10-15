// 업로드 파일 처리 — 저장소는 S3(src/lib/storage.ts). 증빙 첨부 키는 "attachments/UUID.ext", 생성 PDF 는 "generated/{txId}/파일.pdf".
import { extOf } from "./uploadRules";
import { ATTACHMENT_PREFIX, STAGING_PREFIX, copyObject, deleteObject, getObjectRange, headObject, putObject } from "./storage";

export { ALLOWED_EXT, MAX_UPLOAD_BYTES, extOf } from "./uploadRules";

/** 암호화(DRM)된 PDF 여부 — /Encrypt 사전이 있으면 RCMS 업로드 불가 */
export function looksEncryptedPdf(buf: Buffer, fileName: string): boolean {
  if (extOf(fileName) !== "pdf") return false;
  // 암호화 사전은 보통 trailer 근처. 파일 끝 64KB + 앞 4KB 만 검사해 대용량 비용 회피
  const tail = buf.subarray(Math.max(0, buf.length - 65536)).toString("latin1");
  const head = buf.subarray(0, 4096).toString("latin1");
  return /\/Encrypt\b/.test(tail) || /\/Encrypt\b/.test(head);
}

/** S3 에 올라간 PDF 의 머리 4KB·꼬리 64KB 만 읽어 암호화 여부 검사 */
export async function looksEncryptedPdfAt(key: string, size: number, fileName: string): Promise<boolean> {
  if (extOf(fileName) !== "pdf" || size <= 0) return false;
  const head = await getObjectRange(key, `bytes=0-${Math.min(4095, size - 1)}`);
  if (/\/Encrypt\b/.test(head.toString("latin1"))) return true;
  if (size <= 4096) return false;
  const tail = await getObjectRange(key, `bytes=${Math.max(0, size - 65536)}-${size - 1}`);
  return /\/Encrypt\b/.test(tail.toString("latin1"));
}

function newStoredName(originalName: string): string {
  const ext = extOf(originalName);
  return `${ATTACHMENT_PREFIX}${crypto.randomUUID()}${ext ? "." + ext : ""}`;
}

/** 서버가 가진 버퍼를 저장(데이터 이전·테스트용). 저장 키·크기 반환 */
export async function saveUploadBuffer(
  buf: Buffer,
  originalName: string,
  contentType?: string | null,
): Promise<{ storedName: string; size: number }> {
  const storedName = newStoredName(originalName);
  await putObject(storedName, buf, contentType ?? undefined);
  return { storedName, size: buf.length };
}

/** 브라우저가 staging/ 에 직접 올린 객체를 정식 키(attachments/…)로 옮긴다 */
export async function promoteStaged(
  stagingKey: string,
  originalName: string,
  contentType?: string | null,
): Promise<{ storedName: string; size: number }> {
  if (!stagingKey.startsWith(STAGING_PREFIX)) throw new Error("잘못된 업로드 키입니다.");
  const head = await headObject(stagingKey);
  if (!head) throw new Error("업로드된 파일을 찾을 수 없습니다. 다시 올려주세요.");
  const storedName = newStoredName(originalName);
  await copyObject(stagingKey, storedName, contentType ?? head.contentType ?? undefined);
  await deleteObject(stagingKey);
  return { storedName, size: head.size };
}

/** 저장 키의 객체 삭제 — 첨부 "attachments/UUID.ext", 생성 PDF "generated/{txId}/파일.pdf" */
export async function deleteUpload(storedName: string): Promise<void> {
  await deleteObject(storedName);
}

/** 사람이 읽기 쉬운 파일 크기 */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
