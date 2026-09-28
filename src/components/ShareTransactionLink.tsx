"use client";

import { useState } from "react";

export default function ShareTransactionLink({
  href,
  title,
  compact = false,
}: {
  href: string;
  title: string;
  compact?: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  const copyFallback = (url: string) => {
    const textarea = document.createElement("textarea");
    textarea.value = url;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  };

  const share = async () => {
    const url = new URL(href, window.location.origin).toString();
    setStatus("idle");
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, text: title, url });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else if (!copyFallback(url)) {
        throw new Error("copy failed");
      }
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 1800);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      if (copyFallback(url)) {
        setStatus("copied");
        window.setTimeout(() => setStatus("idle"), 1800);
      } else {
        setStatus("error");
      }
    }
  };

  const label = status === "copied" ? "복사됨" : status === "error" ? "복사 실패" : compact ? "공유" : "🔗 링크 공유";

  return (
    <button
      type="button"
      onClick={share}
      className={compact
        ? `text-xs font-medium hover:underline ${status === "error" ? "text-red-600" : status === "copied" ? "text-green-700" : "text-slate-600"}`
        : `rounded-lg border bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-100 ${status === "error" ? "border-red-300 text-red-600" : status === "copied" ? "border-green-300 text-green-700" : "border-slate-300 text-slate-700"}`}
      aria-live="polite"
    >
      {label}
    </button>
  );
}
