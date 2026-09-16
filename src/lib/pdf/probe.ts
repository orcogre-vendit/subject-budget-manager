// 이미지가 react-pdf 에 실제로 들어갈 수 있는지 검사.
// react-pdf 는 이미지 파싱에 실패하면 예외 없이 빈 칸으로 그리므로(경고만), 렌더 전에 파서를 직접 돌려 걸러낸다.
import resolveImage from "@react-pdf/image";

export async function probeImage(data: Buffer): Promise<boolean> {
  try {
    const img = (await resolveImage(data)) as { width?: number; height?: number } | null;
    return !!img && (img.width ?? 0) > 0 && (img.height ?? 0) > 0;
  } catch {
    return false;
  }
}
