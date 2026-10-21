// 휴대폰 사진 줄이기 — 긴 변 2560px, JPEG 85%. 데이터 요금·업로드 시간을 줄이고, 검수확인서 PDF 에 넣기 좋은 크기로.
// 회전 정보(EXIF)는 createImageBitmap 이 반영한 뒤 버린다. 줄일 필요가 없거나 실패하면 원본을 그대로 돌려준다.

const MAX_SIDE = 2560;
const QUALITY = 0.85;
const SKIP_BELOW_BYTES = 1.5 * 1024 * 1024;

export async function shrinkPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= SKIP_BELOW_BYTES && /jpe?g|png/.test(file.type)) {
      bitmap.close();
      return file;
    }
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", QUALITY));
    if (!blob || blob.size >= file.size) return file;
    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}
