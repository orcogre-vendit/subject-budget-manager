import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import RecordForm from "@/components/RecordForm";
import { toFormValues } from "@/lib/form";
import { PROJECT_FIELDS } from "../../fields";
import { updateProject } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const projectId = Number(id);
  if (!projectId) notFound();

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={`/projects/${projectId}`}
        className="text-sm text-slate-400 hover:text-slate-700"
      >
        ← 과제 상세
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">
        과제 수정 — {project.name}
      </h1>
      <RecordForm
        fields={PROJECT_FIELDS}
        action={updateProject}
        submitLabel="저장"
        defaultValues={toFormValues(PROJECT_FIELDS, project)}
        hidden={{ id: project.id }}
        cancelHref={`/projects/${projectId}`}
      />
    </div>
  );
}
