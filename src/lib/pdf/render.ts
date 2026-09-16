// PDF 렌더 → UPLOAD_DIR/generated/... 저장. DRM·암호화 없는 순수 PDF (RCMS 업로드 요건).
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import type { ReactElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { UPLOAD_DIR } from "@/lib/uploads";
import { registerPdfFonts } from "./font";

export async function renderPdfBuffer(element: ReactElement): Promise<Buffer> {
  registerPdfFonts();
  // renderToBuffer 는 <Document> 엘리먼트를 받는다
  return renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
}

/**
 * PDF 파일로 저장. relDir 은 UPLOAD_DIR 기준 상대경로 (예: generated/12)
 * @returns UPLOAD_DIR 기준 상대경로와 바이트 수
 */
export async function renderPdfFile(
  element: ReactElement,
  relDir: string,
  fileName: string,
): Promise<{ relPath: string; size: number }> {
  const buf = await renderPdfBuffer(element);
  const dir = path.join(UPLOAD_DIR, relDir);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), buf);
  return { relPath: path.posix.join(relDir, fileName), size: buf.length };
}
