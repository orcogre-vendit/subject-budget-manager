// PDF 한글 폰트 — Pretendard(OFL) TTF를 public/fonts 에서 등록. 미등록 시 한글이 깨진다.
import path from "path";
import { Font } from "@react-pdf/renderer";

export const PDF_FONT = "Pretendard";

let registered = false;

export function registerPdfFonts(): void {
  if (registered) return;
  const dir = path.join(process.cwd(), "public", "fonts");
  Font.register({
    family: PDF_FONT,
    fonts: [
      { src: path.join(dir, "Pretendard-Regular.ttf"), fontWeight: 400 },
      { src: path.join(dir, "Pretendard-Bold.ttf"), fontWeight: 700 },
    ],
  });
  // 한글은 하이픈 분절 없이 글자 단위로 줄바꿈
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
