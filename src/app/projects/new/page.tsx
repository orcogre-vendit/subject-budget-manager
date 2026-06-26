import Link from "next/link";
import RecordForm from "@/components/RecordForm";
import { PROJECT_FIELDS } from "../fields";
import { createProject } from "../actions";

export default function NewProjectPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/projects"
        className="text-sm text-slate-400 hover:text-slate-700"
      >
        ← 과제 목록
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">새 과제 등록</h1>
      <RecordForm
        fields={PROJECT_FIELDS}
        action={createProject}
        submitLabel="등록"
        defaultValues={{ active: "on" }}
        cancelHref="/projects"
      />
    </div>
  );
}
