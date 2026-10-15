// 레코드 id 는 UUID 문자열 — URL 파라미터·FormData 에서 읽을 때 형식을 검증한다 (DB 조회 전에 쓰레기 값 차단)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** FormData 값·URL 조각 → UUID 또는 null */
export function idOf(v: FormDataEntryValue | string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  return UUID_RE.test(s) ? s : null;
}
