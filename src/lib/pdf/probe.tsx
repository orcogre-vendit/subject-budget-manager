// 이미지 디코딩 가능 여부 검사 — 이미지 하나만 넣은 1쪽 PDF 를 만들어 보고 실패하면 false.
// 깨진 JPEG·CMYK 같은 미지원 이미지가 검수확인서 생성 전체를 실패시키지 않도록 걸러낼 때 쓴다.
import { Document, Image, Page } from "@react-pdf/renderer";
import { renderPdfBuffer } from "./render";

export async function probeImage(data: Buffer): Promise<boolean> {
  try {
    await renderPdfBuffer(
      <Document>
        <Page size="A6">
          {/* react-pdf Image — HTML <img> 가 아니므로 alt 미지원 */}
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={data} style={{ width: 100, height: 100 }} />
        </Page>
      </Document>,
    );
    return true;
  } catch {
    return false;
  }
}
