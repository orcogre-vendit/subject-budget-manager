import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";

/** 업로드 파일 저장 위치. 배포 시 UPLOAD_DIR로 볼륨 경로 지정(기본: 프로젝트 루트/uploads) */
export const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB

/** 증빙 허용 확장자 — RCMS 업로드 요건 (PNG, PDF, PPT/PPTX, DOC/DOCX, XLS/XLSX, HWP/HWPX, JPG, TIFF, GIF, BMP) */
export const ALLOWED_EXT = new Set([
  "png", "pdf", "ppt", "pptx", "doc", "docx", "xls", "xlsx",
  "hwp", "hwpx", "jpg", "jpeg", "tif", "tiff", "gif", "bmp",
]);

/** 암호화(DRM)된 PDF 여부 — /Encrypt 사전이 있으면 RCMS 업로드 불가 */
export function looksEncryptedPdf(buf: Buffer, fileName: string): boolean {
  if (extOf(fileName) !== "pdf") return false;
  // 암호화 사전은 보통 trailer 근처. 파일 끝 64KB + 앞 4KB 만 검사해 대용량 비용 회피
  const tail = buf.subarray(Math.max(0, buf.length - 65536)).toString("latin1");
  const head = buf.subarray(0, 4096).toString("latin1");
  return /\/Encrypt\b/.test(tail) || /\/Encrypt\b/.test(head);
}

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export async function ensureUploadDir(): Promise<void> {
  await mkdir(UPLOAD_DIR, { recursive: true });
}

/** File을 디스크에 저장하고 저장명·크기 반환 */
export async function saveUpload(
  file: File,
): Promise<{ storedName: string; size: number }> {
  await ensureUploadDir();
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = extOf(file.name);
  const storedName = `${crypto.randomUUID()}${ext ? "." + ext : ""}`;
  await writeFile(path.join(UPLOAD_DIR, storedName), buf);
  return { storedName, size: buf.length };
}

export async function deleteUpload(storedName: string): Promise<void> {
  try {
    await unlink(path.join(UPLOAD_DIR, storedName));
  } catch {
    // 파일이 이미 없으면 무시
  }
}

/** 사람이 읽기 쉬운 파일 크기 */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
