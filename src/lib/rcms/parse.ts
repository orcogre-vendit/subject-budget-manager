// RCMS "연구비 이체 실행 대상 목록" 엑셀 → 행 객체.
// 헤더 2행(그룹행 + 컬럼행) 구조라 "과제번호"/"사용금액" 이 있는 행을 컬럼 헤더로 잡는다.
import { createHash } from "crypto";
import { readFirstSheet } from "@/lib/xlsx";

export type RcmsRow = {
  key: string;
  rcmsProjectNo: string;
  projectName: string;
  stage: string | null;
  yearNo: number | null;
  registeredAt: Date | null;
  useDate: Date | null;
  progress: string | null;
  execStatus: string | null;
  evidenceType: string | null;
  budgetPath: string | null;
  useAmount: number;
  supplyAmount: number;
  vatAmount: number;
  vendor: string | null;
  vendorBizNo: string | null;
  bank: string | null;
  account: string | null;
  holder: string | null;
  purpose: string | null;
  regType: string | null;
  execStage: string | null;
  itemName: string | null;
  raw: Record<string, string>;
};

/** 공백·줄바꿈 제거 (헤더 "거래처\n사업자등록번호" 대응) */
export const norm = (s: string) => s.replace(/\s+/g, "");

const COL = {
  projectNo: "과제번호",
  projectName: "과제명",
  stage: "단계",
  yearNo: "연차",
  execStatus: "집행상태",
  registeredAt: "등록일시",
  useDate: "사용일자",
  progress: "진행상태",
  evidenceType: "증빙구분",
  budgetPath: "비목정보",
  useAmount: "사용금액",
  supplyAmount: "공급금액",
  vatAmount: "부가세액",
  bank: "입금은행",
  account: "입금계좌번호",
  holder: "예금주명",
  vendor: "거래처명",
  vendorBizNo: "거래처사업자등록번호",
  purpose: "지급용도",
  regType: "등록구분",
  execStage: "집행단계",
  itemName: "품목명",
} as const;

const REQUIRED = [COL.projectNo, COL.yearNo, COL.useDate, COL.useAmount, COL.supplyAmount, COL.vatAmount];

/** "2026.09.11" / "2026-09-11 12:40:27" → UTC 기준 Date (앱 전체가 날짜를 UTC 자정으로 저장) */
export function parseRcmsDate(s: string): Date | null {
  const m = s.trim().match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "166258.0" / "1,234" → 정수 원 */
export function toWon(v: string): number {
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? Math.round(n) : 0;
}

const nz = (v: string | undefined): string | null => {
  const t = (v ?? "").trim();
  return t && t !== "-" ? t : null;
};

/** RCMS 비목정보 "직접비>연구재료비>연구재료 구입비" → 우리 분류 (비목/세목/세세목). 앞의 직접비/간접비 그룹은 비목이 아니면 제거 */
export function parseRcmsBudgetPath(path: string | null | undefined): { item: string | null; sub: string | null; detail: string | null } {
  const segs = (path ?? "").split(">").map((s) => s.trim()).filter(Boolean);
  if (segs.length > 1 && segs[0] === "직접비") segs.shift();
  if (segs.length > 1 && segs[0] === "간접비" && segs[1] === "간접비") segs.shift();
  return { item: segs[0] ?? null, sub: segs[1] ?? null, detail: segs[2] ?? null };
}

export function parseRcmsExport(buf: Buffer): { rows: RcmsRow[]; headerIndex: number } {
  const sheet = readFirstSheet(buf);
  const hi = sheet.findIndex((r) => r.some((c) => norm(c) === COL.projectNo) && r.some((c) => norm(c) === COL.useAmount));
  if (hi < 0) throw new Error("RCMS 엑셀 형식이 아닙니다 (과제번호·사용금액 헤더를 찾을 수 없음)");
  // 컬럼 헤더가 비어 있으면 위 그룹 헤더행(병합 셀)의 값을 쓴다 — "품목명" 처럼 2행 병합된 컬럼 대응
  const groupRow = hi > 0 ? sheet[hi - 1] : [];
  const header = sheet[hi].map((h, i) => norm(h) || norm(groupRow[i] ?? ""));
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`필요한 컬럼이 없습니다: ${missing.join(", ")}`);
  const idx = new Map(header.map((h, i) => [h, i] as const));

  const rows: RcmsRow[] = [];
  for (const line of sheet.slice(hi + 1)) {
    const get = (label: string) => line[idx.get(label) ?? -1] ?? "";
    const projectNo = get(COL.projectNo).trim();
    if (!projectNo) continue;
    const yearNoRaw = get(COL.yearNo).trim();
    const yearNo = yearNoRaw ? Math.trunc(Number(yearNoRaw)) : NaN;
    const useAmount = toWon(get(COL.useAmount));
    const supplyAmount = toWon(get(COL.supplyAmount));
    const vatAmount = toWon(get(COL.vatAmount));
    const registeredAtRaw = get(COL.registeredAt).trim();
    const useDateRaw = get(COL.useDate).trim();
    const vendor = nz(get(COL.vendor));
    const itemName = nz(get(COL.itemName));

    const key = createHash("sha1")
      .update([projectNo, registeredAtRaw, useDateRaw, useAmount, vendor ?? "", itemName ?? ""].join("|"))
      .digest("hex")
      .slice(0, 24);

    const raw: Record<string, string> = {};
    header.forEach((h, i) => { if (h) raw[h] = line[i] ?? ""; });

    rows.push({
      key,
      rcmsProjectNo: projectNo,
      projectName: get(COL.projectName).trim(),
      stage: nz(get(COL.stage)),
      yearNo: Number.isFinite(yearNo) ? yearNo : null,
      registeredAt: parseRcmsDate(registeredAtRaw),
      useDate: parseRcmsDate(useDateRaw),
      progress: nz(get(COL.progress)),
      execStatus: nz(get(COL.execStatus)),
      evidenceType: nz(get(COL.evidenceType)),
      budgetPath: nz(get(COL.budgetPath)),
      useAmount,
      supplyAmount,
      vatAmount,
      vendor,
      vendorBizNo: nz(get(COL.vendorBizNo)),
      bank: nz(get(COL.bank)),
      account: nz(get(COL.account)),
      holder: nz(get(COL.holder)),
      purpose: nz(get(COL.purpose)),
      regType: nz(get(COL.regType)),
      execStage: nz(get(COL.execStage)),
      itemName,
      raw,
    });
  }
  return { rows, headerIndex: hi };
}
