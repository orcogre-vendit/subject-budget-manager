import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { maskSsn, maskAccount } from "@/lib/format";
import DeleteButton from "@/components/DeleteButton";
import { deleteResearcher } from "./actions";

export const dynamic = "force-dynamic";

export default async function ResearchersPage() {
  const researchers = await prisma.researcher.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">연구원 관리</h1>
          <p className="mt-1 text-sm text-slate-500">
            총 {researchers.length}명 · 민감정보(주민번호·계좌)는 목록에서 마스킹
            표시
          </p>
        </div>
        <Link
          href="/researchers/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          + 새 연구원
        </Link>
      </div>

      {researchers.length === 0 ? (
        <p className="mt-6 rounded-lg bg-slate-100 px-4 py-8 text-center text-sm text-slate-500">
          등록된 연구원이 없습니다. 우측 상단에서 추가하세요.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-3 font-medium">이름</th>
                <th className="px-4 py-3 font-medium">직책</th>
                <th className="px-4 py-3 font-medium">소속</th>
                <th className="px-4 py-3 font-medium">이메일</th>
                <th className="px-4 py-3 font-medium">전화번호</th>
                <th className="px-4 py-3 font-medium">주민번호</th>
                <th className="px-4 py-3 font-medium">계좌</th>
                <th className="px-4 py-3 text-right font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {researchers.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {r.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.title ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.affiliation ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.email ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{r.phone ?? "-"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {maskSsn(r.ssn)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {r.bankName ? `${r.bankName} ` : ""}
                    {maskAccount(r.accountNo)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/researchers/${r.id}/edit`}
                        className="text-xs font-medium text-slate-600 hover:underline"
                      >
                        수정
                      </Link>
                      <DeleteButton
                        action={deleteResearcher}
                        id={r.id}
                        confirmText={`'${r.name}' 연구원을 삭제하시겠습니까?`}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
