import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";

/** 업로드 파일 저장 위치 (프로젝트 루트/uploads, gitignore) */
export const UPLOAD_DIR = path.join(process.cwd(), "uploads");

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB

/** 증빙으로 허용하는 확장자 (영수증/계산서/사진/문서) */
export const ALLOWED_EXT = new Set([
  "pdf", "png", "jpg", "jpeg", "gif", "webp", "heic",
  "xlsx", "xls", "docx", "doc", "ppt", "pptx",
  "hwp", "hwpx", "txt", "csv", "zip",
]);

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
