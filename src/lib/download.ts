// 다운로드 URL·헤더 — 파일명이 URL 마지막 조각과 Content-Disposition 양쪽에 들어가야
// 브라우저 PDF 뷰어의 "저장"도, 링크 다운로드도 "02-검수확인서-….pdf" 같은 제대로 된 이름·확장자로 떨어진다.
// (Chrome PDF 뷰어는 헤더의 filename* 을 무시하고 URL 마지막 조각을 쓰는 경우가 있다)

/** /api/documents/17 + "02-….pdf" → /api/documents/17/02-%E2%80%A6.pdf (download=true 면 ?download=1 로 강제 저장) */
export function downloadHref(base: string, fileName: string, download = false): string {
  return `${base}/${encodeURIComponent(fileName)}${download ? "?download=1" : ""}`;
}

/** RFC 6266/5987: ASCII 대체 이름 + UTF-8 실제 이름 */
export function contentDisposition(fileName: string, download: boolean): string {
  const ascii = fileName.replace(/["\\]/g, "").replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(fileName);
  return `${download ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** 요청 URL 에 ?download=1 이 있으면 강제 저장 */
export function wantsDownload(req: Request): boolean {
  return new URL(req.url).searchParams.get("download") === "1";
}
