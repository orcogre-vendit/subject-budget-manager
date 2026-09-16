// JPEG 정리 — react-pdf 의 마커 파서(jay-peg)가 아이폰 사진의 XMP·ICC·APP10 같은 부가 세그먼트에서 죽는다
// ("Unknown version …"). 화질에 영향 없는 APPn/COM 세그먼트를 걷어내고 EXIF(회전 정보) 만 남긴다.
// 순수 버퍼 조작이라 외부 라이브러리가 필요 없다.

const SOI = 0xffd8;

/** JPEG 이면 EXIF APP1 + 압축 데이터만 남긴 새 버퍼, 아니면 원본 그대로 */
export function sanitizeJpeg(buf: Buffer): Buffer {
  if (buf.length < 4 || buf.readUInt16BE(0) !== SOI) return buf;
  const parts: Buffer[] = [buf.subarray(0, 2)];
  let i = 2;
  let keptExif = false;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) return buf; // 마커 동기 깨짐 — 손대지 않는다
    const marker = buf[i + 1];
    if (marker === 0xff) { i += 1; continue; } // 패딩
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; } // 길이 없는 마커
    const len = buf.readUInt16BE(i + 2);
    const end = i + 2 + len;
    if (len < 2 || end > buf.length) return buf;
    if (marker === 0xda) {
      // SOS 부터 끝까지는 그대로 (엔트로피 데이터 + EOI)
      parts.push(buf.subarray(i));
      return Buffer.concat(parts);
    }
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const isCom = marker === 0xfe;
    const isExif = marker === 0xe1 && buf.subarray(i + 4, i + 10).toString("latin1") === "Exif\0\0";
    if (isExif && !keptExif) {
      parts.push(buf.subarray(i, end));
      keptExif = true;
    } else if (!isApp && !isCom) {
      parts.push(buf.subarray(i, end)); // DQT, SOF, DHT, DRI 등 디코딩에 필요한 세그먼트
    }
    i = end;
  }
  return buf;
}
