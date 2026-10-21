// 모바일 거래 상세 — 사진 올리기(맨 위) + 읽기 전용 정보(금액·품목·증빙 체크리스트·첨부). 수정은 PC 화면에서.
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { idOf } from "@/lib/ids";
import { won, ymd } from "@/lib/format";
import { fmtUnitPrice } from "@/lib/money";
import { humanSize } from "@/lib/uploads";
import { DOC_TEMPLATE_EVIDENCE, evaluateEvidence, evidenceLabel } from "@/lib/evidence";
import { seqLabel } from "@/lib/evidenceName";
import { downloadHref } from "@/lib/download";
import MobilePhotoUpload from "@/components/mobile/MobilePhotoUpload";
import { uploadAttachments } from "@/app/projects/[id]/years/[yearId]/ledger/actions";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="min-w-0 break-keep text-right font-medium text-slate-800">{value || "-"}</span>
    </div>
  );
}

export default async function MobileTx({ params }: { params: Promise<{ txId: string }> }) {
  const { txId } = await params;
  const id = idOf(txId);
  if (!id) notFound();

  const tx = await prisma.transaction.findUnique({
    where: { id },
    include: {
      projectYear: { select: { id: true, projectId: true } },
      budgetItem: { select: { name: true } },
      budgetSubItem: { include: { evidenceRequirements: { orderBy: { sortOrder: "asc" } } } },
      budgetDetailItem: { select: { name: true } },
      items: { orderBy: { sortOrder: "asc" } },
      attachments: { orderBy: { uploadedAt: "desc" } },
      documents: { select: { templateCode: true, format: true } },
    },
  });
  if (!tx) notFound();

  const isOut = tx.direction === "OUT" && !tx.budgetAdjust;
  const reqs = tx.budgetSubItem?.evidenceRequirements ?? [];
  const codes = [
    ...tx.attachments.map((a) => a.evidenceCode).filter((c): c is string => !!c),
    ...tx.documents.filter((d) => d.format === "pdf" && DOC_TEMPLATE_EVIDENCE[d.templateCode]).map((d) => DOC_TEMPLATE_EVIDENCE[d.templateCode]),
  ];
  const checklist = evaluateEvidence(
    reqs.map((r) => ({ code: r.code, label: r.label, requirement: r.requirement, groupKey: r.groupKey })),
    codes,
  );
  const vatPending = isOut && tx.vatAmount > 0 && tx.status !== "완료" && tx.status !== "취소";
  const pcHref = `/projects/${tx.projectYear.projectId}/years/${tx.projectYear.id}/ledger?tx=${tx.id}#detail`;

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/m/years/${tx.projectYear.id}`} className="text-sm text-slate-400">← 원장</Link>
        <p className="mt-1 text-xs text-slate-400">No. {seqLabel(tx.seqNo)} · {ymd(tx.date)} · {tx.status}</p>
        <h1 className="mt-0.5 break-keep text-lg font-bold leading-6 text-slate-900">{tx.description ?? tx.vendor ?? "거래"}</h1>
        <p className={`mt-1 text-2xl font-bold ${tx.budgetAdjust ? "text-violet-600" : tx.direction === "IN" ? "text-blue-600" : "text-red-600"}`}>
          {tx.direction === "IN" ? "+" : "−"}{won(tx.amount)}
        </p>
        {isOut && tx.vatAmount > 0 && <p className="text-sm text-slate-500">부가세 {won(tx.vatAmount)} · 총액 {won(tx.amount + tx.vatAmount)}</p>}
        {vatPending && (
          <p className="mt-2 rounded-lg bg-orange-100 px-3 py-2 text-sm font-medium text-orange-800">💰 부가세 {won(tx.vatAmount)} 입금 필요 (법인계좌 → 연구비 전용계좌)</p>
        )}
        {tx.budgetAdjust && <p className="mt-2 rounded-lg bg-violet-100 px-3 py-2 text-sm text-violet-800">편성 조정 기록입니다. 집행이 아니라 증빙 대상이 아닙니다.</p>}
      </div>

      {isOut && (
        <MobilePhotoUpload
          action={uploadAttachments}
          transactionId={tx.id}
          projectId={tx.projectYear.projectId}
          projectYearId={tx.projectYear.id}
          suggestedCodes={reqs.map((r) => r.code)}
        />
      )}

      {isOut && reqs.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-bold text-slate-900">증빙 체크리스트</h2>
          <p className={`mt-2 rounded-lg px-3 py-2 text-sm ${checklist.ok ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"}`}>
            {checklist.ok ? "필수 증빙이 모두 있습니다." : `부족: ${checklist.missing.join(", ")}`}
          </p>
          <ul className="mt-2 space-y-1.5">
            {checklist.rows.map((r) => (
              <li key={r.code} className="flex items-start gap-2 text-sm">
                <span>{r.met ? "✅" : "☐"}</span>
                <span className={r.met ? "text-slate-800" : "text-slate-500"}>
                  {r.label}
                  {r.requirement !== "required" && <span className="ml-1 text-xs text-slate-400">({r.requirement === "one_of" ? "택1" : "선택"})</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-bold text-slate-900">증빙 ({tx.attachments.length})</h2>
        {tx.attachments.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">아직 없습니다.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-3 gap-2">
            {tx.attachments.map((a) => {
              const href = downloadHref(`/api/attachments/${a.id}`, a.fileName);
              const img = (a.mimeType ?? "").startsWith("image/");
              return (
                <li key={a.id}>
                  <a href={href} target="_blank" rel="noopener noreferrer" className="block">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={href} alt={a.fileName} loading="lazy" className="aspect-square w-full rounded-lg object-cover ring-1 ring-slate-200" />
                    ) : (
                      <span className="flex aspect-square w-full items-center justify-center rounded-lg bg-slate-100 text-3xl">📄</span>
                    )}
                    <span className="mt-1 block truncate text-[11px] font-medium text-slate-700">{evidenceLabel(a.evidenceCode)}</span>
                    <span className="block text-[10px] text-slate-400">{humanSize(a.size)}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-bold text-slate-900">거래 정보</h2>
        <div className="mt-1 divide-y divide-slate-100">
          <Row label="분류" value={[tx.budgetItem?.name, tx.budgetSubItem?.name, tx.budgetDetailItem?.name].filter(Boolean).join(" › ")} />
          <Row label="거래처" value={tx.vendor} />
          <Row label="결제수단" value={tx.paymentMethod} />
          <Row label="입금계좌" value={[tx.vendorBank, tx.vendorAccount, tx.vendorHolder].filter(Boolean).join(" ")} />
          <Row label="납품일" value={tx.deliveryDate ? ymd(tx.deliveryDate) : null} />
          <Row label="검수일" value={tx.inspectionDate ? ymd(tx.inspectionDate) : null} />
          <Row label="구매 사유" value={tx.purpose} />
        </div>
      </section>

      {tx.items.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-bold text-slate-900">품목 ({tx.items.length})</h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {tx.items.map((it) => (
              <li key={it.id} className="py-2">
                <p className="text-sm font-medium text-slate-800">{it.name}</p>
                {it.spec && <p className="text-xs text-slate-500">{it.spec}</p>}
                <p className="mt-0.5 text-xs text-slate-500">
                  {it.quantity}개 × {fmtUnitPrice(it.unitPrice)}원 = <b className="text-slate-800">{won(it.amount)}</b>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link href={pcHref} className="block rounded-xl border border-slate-300 bg-white py-3 text-center text-sm font-medium text-slate-600">
        수정·서류 생성은 PC 화면에서 →
      </Link>
    </div>
  );
}
