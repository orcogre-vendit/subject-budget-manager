// 최소 XLSX 리더 — 외부 라이브러리 없이 zip(deflate) + SpreadsheetML 을 직접 파싱한다.
// RCMS 엑셀 내보내기(inlineStr/숫자 셀) 읽기 용도. 수식 계산·날짜 서식·ZIP64 는 지원하지 않는다.
import { inflateRawSync } from "zlib";

export type SheetRows = string[][];

const SIG_EOCD = 0x06054b50;
const SIG_CDIR = 0x02014b50;

function findEocd(buf: Buffer): number {
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  throw new Error("ZIP 형식이 아닙니다 (xlsx 파일인지 확인하세요)");
}

/** zip 엔트리 이름 → 압축 해제된 내용 */
export function readZipEntries(buf: Buffer): Map<string, Buffer> {
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== SIG_CDIR) throw new Error("ZIP 중앙 디렉터리가 손상되었습니다");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    if (compSize === 0xffffffff || local === 0xffffffff) throw new Error("ZIP64 형식은 지원하지 않습니다");
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(dataStart, dataStart + compSize);
    if (method === 8) out.set(name, inflateRawSync(data));
    else if (method === 0) out.set(name, Buffer.from(data));
    else throw new Error(`지원하지 않는 압축 방식입니다 (${method})`);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function unescapeXml(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (m, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e] ?? m;
  });
}

/** <t> 조각들을 이어붙인 텍스트 (rich text 포함) */
function textOf(xml: string): string {
  return [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join("");
}

/** "AB" → 27 (0-based) */
function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** 첫 번째 워크시트를 문자열 2차원 배열로. 빈 셀은 "" */
export function readFirstSheet(buf: Buffer): SheetRows {
  const entries = readZipEntries(buf);
  const wb = entries.get("xl/workbook.xml")?.toString("utf8") ?? "";
  const rels = entries.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";

  let target = "xl/worksheets/sheet1.xml";
  const rid = wb.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  if (rid) {
    const rel = rels.match(new RegExp(`<Relationship\\b[^>]*\\bId="${rid}"[^>]*>`))?.[0];
    const t = rel?.match(/Target="([^"]+)"/)?.[1];
    if (t) target = t.startsWith("/") ? t.slice(1) : `xl/${t}`;
  }
  const sheetXml = entries.get(target)?.toString("utf8");
  if (!sheetXml) throw new Error("워크시트를 찾을 수 없습니다");

  const shared: string[] = [];
  const ssXml = entries.get("xl/sharedStrings.xml")?.toString("utf8") ?? "";
  for (const m of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));

  const rows: SheetRows = [];
  for (const rm of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const inner = cm[2] ?? "";
      const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1];
      if (!ref) continue;
      const t = attrs.match(/\bt="(\w+)"/)?.[1];
      let val = "";
      if (t === "inlineStr") val = textOf(inner);
      else if (t === "s") val = shared[Number(inner.match(/<v>([\s\S]*?)<\/v>/)?.[1])] ?? "";
      else val = unescapeXml(inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "");
      cells[colIndex(ref)] = val;
    }
    rows.push(Array.from(cells, (v) => v ?? ""));
  }
  return rows;
}
