"use client";

// 입력 중 3자리마다 콤마를 찍어 보여주는 금액 입력.
// 화면엔 "1,000,000"으로 보이되 그대로 제출되고, 서버는 콤마를 제거해 파싱한다.
const fmt = (digits: string) => (digits ? Number(digits).toLocaleString("ko-KR") : "");

export default function MoneyInput({
  name,
  defaultValue = "",
  placeholder,
  suffix,
  onValueChange,
  readOnly,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  suffix?: string;
  /** 입력 중 숫자(콤마 제거) 콜백 — 부가세 자동계산 등 */
  onValueChange?: (digits: string) => void;
  readOnly?: boolean;
}) {
  const initial = String(defaultValue ?? "").replace(/\D/g, "");
  const cls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900" +
    (suffix ? " pr-10" : "");

  return (
    <div className="relative">
      <input
        id={name}
        name={name}
        type="text"
        inputMode="numeric"
        defaultValue={fmt(initial)}
        placeholder={placeholder}
        readOnly={readOnly}
        onInput={(e) => {
          const digits = e.currentTarget.value.replace(/\D/g, "");
          e.currentTarget.value = fmt(digits);
          onValueChange?.(digits);
        }}
        className={cls + (readOnly ? " bg-slate-50 text-slate-600" : "")}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
          {suffix}
        </span>
      )}
    </div>
  );
}
