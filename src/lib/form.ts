import type { ProjectField } from "@/app/projects/fields";
import { ymd } from "./format";

/** DB 레코드 → 폼 입력용 문자열 맵 (날짜→YYYY-MM-DD, 불리언→on/"") */
export function toFormValues(
  fields: ProjectField[],
  record: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = record[f.key];
    if (f.type === "checkbox") out[f.key] = v ? "on" : "";
    else if (f.type === "date") out[f.key] = v ? ymd(v as Date) : "";
    else out[f.key] = v == null ? "" : String(v);
  }
  return out;
}
