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

// ── HEIC(아이폰 기본 사진 형식) → JPEG ──
// RCMS 증빙 허용 형식에 HEIC 가 없고, 크롬·엣지는 HEIC 를 열지 못한다. 그래서 올리기 전에 브라우저에서 JPEG 로 바꾼다.
// Safari 는 HEIC 를 직접 디코딩하므로 먼저 그 경로를 쓰고, 안 되면 heic2any(libheif, 약 1.3MB)를 그때만 불러온다.

export function isHeic(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

export async function heicToJpeg(file: File): Promise<File> {
  const base = file.name.replace(/\.[^.]+$/, "") || "photo";
  const out = (blob: Blob) => new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.9));
    if (blob) return out(blob);
  } catch {
    // 이 브라우저는 HEIC 를 직접 못 연다 → libheif 로
  }
  const { default: heic2any } = await import("heic2any");
  const res = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  return out(Array.isArray(res) ? res[0] : res);
}

/** HEIC 면 JPEG 로 바꾸고, 사진이면 긴 변 2560px 로 줄인다 */
export async function preparePhoto(file: File): Promise<File> {
  const jpeg = isHeic(file) ? await heicToJpeg(file) : file;
  return shrinkPhoto(jpeg);
}
