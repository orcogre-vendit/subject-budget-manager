import Link from "next/link";
import ResearcherForm from "@/components/ResearcherForm";
import { createResearcher } from "../actions";

export default function NewResearcherPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/researchers"
        className="text-sm text-slate-400 hover:text-slate-700"
      >
        ← 연구원 목록
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">새 연구원 등록</h1>
      <ResearcherForm action={createResearcher} submitLabel="등록" />
    </div>
  );
}
