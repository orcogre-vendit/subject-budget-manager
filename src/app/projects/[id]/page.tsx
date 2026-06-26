import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { won, ymd } from "@/lib/format";
import RecordForm from "@/components/RecordForm";
import DeleteButton from "@/components/DeleteButton";
import { PROJECT_YEAR_FIELDS } from "../fields";
import {
  createProjectYear,
  deleteProject,
  deleteProjectYear,
} from "../actions";

export const dynamic = "force-dynamic";

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{value || "-"}</dd>
    </div>
  );
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const projectId = Number(id);
  if (!projectId) notFound();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      years: {
        orderBy: { yearNo: "asc" },
        include: { _count: { select: { transactions: true } } },
      },
    },
  });
  if (!project) notFound();

  const totalBudget = project.years.reduce((s, y) => s + y.budgetCash, 0);

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/projects"
        className="text-sm text-slate-400 hover:text-slate-700"
      >
        ← 과제 목록
      </Link>

      {/* 헤더 */}
      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
            {project.status && (
              <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-xs text-white">
                {project.status}
              </span>
            )}
            {!project.active && (
              <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs text-slate-500">
                미사용
              </span>
            )}
          </div>
          <p className="mt-1 font-mono text-sm text-slate-500">
            {project.code ?? "과제번호 미지정"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/projects/${project.id}/edit`}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            수정
          </Link>
          <DeleteButton
            action={deleteProject}
            id={project.id}
            confirmText={`'${project.name}' 과제를 삭제하시겠습니까? 연차·집행내역도 함께 삭제됩니다.`}
          />
        </div>
      </div>

      {/* 정보 */}
      <dl className="mt-6 grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-6 sm:grid-cols-3">
        <Info label="사업명" value={project.businessName} />
        <Info label="연구책임" value={project.piName} />
        <Info label="과제담당" value={project.managerName} />
        <Info label="지원기관" value={project.fundingAgency} />
        <Info label="주관연구기관" value={project.hostOrg} />
        <Info
          label="연구기간"
          value={
            project.startDate || project.endDate
              ? `${ymd(project.startDate)} ~ ${ymd(project.endDate)}`
              : null
          }
        />
        <Info label="간접징수비율" value={`${project.indirectRate}%`} />
        <Info label="수행지역" value={project.region} />
        <Info label="카드구분" value={project.cardType} />
        <Info label="과제구분" value={project.category} />
        <Info label="과제분류" value={project.classification} />
        <Info label="연구형태" value={project.researchType} />
        <Info label="관리그룹" value={project.managementGroup} />
      </dl>

      {/* 연차 */}
      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">
          연차 ({project.years.length})
        </h2>
        <p className="text-sm text-slate-500">
          총 편성예산 <span className="font-semibold">{won(totalBudget)}</span>
        </p>
      </div>

      {project.years.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-3 font-medium">연차</th>
                <th className="px-4 py-3 font-medium">라벨</th>
                <th className="px-4 py-3 font-medium">회계연도</th>
                <th className="px-4 py-3 text-right font-medium">예산</th>
                <th className="px-4 py-3 font-medium">기간</th>
                <th className="px-4 py-3 text-center font-medium">집행건수</th>
                <th className="px-4 py-3 text-right font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {project.years.map((y) => (
                <tr
                  key={y.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {y.yearNo}년차
                  </td>
                  <td className="px-4 py-3 text-slate-600">{y.label ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {y.fiscalYear ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-800">
                    {won(y.budgetCash)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {y.startDate || y.endDate
                      ? `${ymd(y.startDate)} ~ ${ymd(y.endDate)}`
                      : "-"}
                  </td>
                  <td className="px-4 py-3 text-center text-slate-500">
                    {y._count.transactions}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/projects/${project.id}/years/${y.id}/ledger`}
                        className="text-xs font-semibold text-slate-900 hover:underline"
                      >
                        원장
                      </Link>
                      <Link
                        href={`/projects/${project.id}/years/${y.id}/edit`}
                        className="text-xs font-medium text-slate-600 hover:underline"
                      >
                        수정
                      </Link>
                      <DeleteButton
                        action={deleteProjectYear}
                        id={y.id}
                        extra={{ projectId: project.id }}
                        confirmText={`${y.yearNo}년차를 삭제하시겠습니까? 집행내역도 함께 삭제됩니다.`}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 연차 추가 */}
      <details className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">
          + 연차 추가
        </summary>
        <RecordForm
          fields={PROJECT_YEAR_FIELDS}
          action={createProjectYear}
          submitLabel="연차 추가"
          hidden={{ projectId: project.id }}
        />
      </details>

      <p className="mt-4 text-xs text-slate-400">
        ※ 집행 원장(거래 입력·비목별 잔액)은 다음 단계에서 연차별로 연결됩니다.
      </p>
    </div>
  );
}
