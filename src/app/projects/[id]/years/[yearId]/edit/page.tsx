import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import RecordForm from "@/components/RecordForm";
import { toFormValues } from "@/lib/form";
import { PROJECT_YEAR_FIELDS } from "../../../../fields";
import { updateProjectYear } from "../../../../actions";

export const dynamic = "force-dynamic";

export default async function EditProjectYearPage({
  params,
}: {
  params: Promise<{ id: string; yearId: string }>;
}) {
  const { id, yearId } = await params;
  const projectId = Number(id);
  const pyId = Number(yearId);
  if (!projectId || !pyId) notFound();

  const year = await prisma.projectYear.findUnique({
    where: { id: pyId },
    include: { project: { select: { name: true } } },
  });
  if (!year || year.projectId !== projectId) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={`/projects/${projectId}`}
        className="text-sm text-slate-400 hover:text-slate-700"
      >
        ← {year.project.name}
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">
        연차 수정 — {year.yearNo}년차
      </h1>
      <RecordForm
        fields={PROJECT_YEAR_FIELDS}
        action={updateProjectYear}
        submitLabel="저장"
        defaultValues={toFormValues(PROJECT_YEAR_FIELDS, year)}
        hidden={{ id: year.id, projectId }}
        cancelHref={`/projects/${projectId}`}
      />
    </div>
  );
}
