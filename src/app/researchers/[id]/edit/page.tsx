import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ResearcherForm from "@/components/ResearcherForm";
import { updateResearcher } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditResearcherPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const researcherId = Number(id);
  if (!researcherId) notFound();

  const researcher = await prisma.researcher.findUnique({
    where: { id: researcherId },
  });
  if (!researcher) notFound();

  // null → "" 변환은 폼 컴포넌트에서 처리. Date/숫자 필드는 없음.
  const defaults = Object.fromEntries(
    Object.entries(researcher).map(([k, v]) => [
      k,
      v == null ? "" : String(v),
    ]),
  );

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/researchers"
        className="text-sm text-slate-400 hover:text-slate-700"
      >
        ← 연구원 목록
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">
        연구원 수정 — {researcher.name}
      </h1>
      <ResearcherForm
        action={updateResearcher}
        defaultValues={defaults}
        researcherId={researcher.id}
        submitLabel="저장"
      />
    </div>
  );
}
