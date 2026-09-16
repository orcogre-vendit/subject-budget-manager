// 업로드 규칙 — 서버(uploads.ts)와 클라이언트(드롭존) 가 같이 쓰는 순수 상수. fs 를 import 하지 않는다.

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB

/** 증빙 허용 확장자 — RCMS 업로드 요건 (PNG, PDF, PPT/PPTX, DOC/DOCX, XLS/XLSX, HWP/HWPX, JPG, TIFF, GIF, BMP) */
export const ALLOWED_EXT = new Set([
  "png", "pdf", "ppt", "pptx", "doc", "docx", "xls", "xlsx",
  "hwp", "hwpx", "jpg", "jpeg", "tif", "tiff", "gif", "bmp",
]);

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}
