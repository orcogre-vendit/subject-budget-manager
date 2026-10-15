// PDF 렌더 → S3 generated/{txId}/… 저장. DRM·암호화 없는 순수 PDF (RCMS 업로드 요건).
import path from "path";
import type { ReactElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { putObject } from "@/lib/storage";
import { registerPdfFonts } from "./font";

export async function renderPdfBuffer(element: ReactElement): Promise<Buffer> {
  registerPdfFonts();
  // renderToBuffer 는 <Document> 엘리먼트를 받는다
  return renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
}

/**
 * PDF 를 만들어 S3 에 저장. relDir 은 버킷 안의 접두 경로 (예: generated/{txId})
 * @returns 저장 키와 바이트 수
 */
export async function renderPdfFile(
  element: ReactElement,
  relDir: string,
  fileName: string,
): Promise<{ relPath: string; size: number }> {
  const buf = await renderPdfBuffer(element);
  const relPath = path.posix.join(relDir, fileName);
  await putObject(relPath, buf, "application/pdf");
  return { relPath, size: buf.length };
}
