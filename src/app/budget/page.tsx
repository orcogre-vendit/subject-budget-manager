import { prisma } from "@/lib/prisma";
import AddBudgetForm from "@/components/AddBudgetForm";

export const dynamic = "force-dynamic";

export default async function BudgetPage() {
  const items = await prisma.budgetItem.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      subItems: {
        orderBy: { name: "asc" },
        include: { detailItems: { orderBy: { name: "asc" } } },
      },
    },
  });

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold text-slate-900">기준정보 — 예산 분류</h1>
      <p className="mt-1 text-sm text-slate-500">
        비목(대분류) → 세목(중분류) → 세세목(소분류) 3단계 체계. 세목·세세목은
        거래 입력 시 자유 입력하면 자동 등록·추천됩니다.
      </p>

      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">비목 추가</h2>
        <AddBudgetForm />
      </div>

      <div className="mt-6 space-y-4">
        {items.map((item) => (
          <section
            key={item.id}
            className="rounded-xl border border-slate-200 bg-white p-5"
          >
            <h2 className="text-base font-bold text-slate-900">
              {item.name}
              <span className="ml-2 text-xs font-normal text-slate-400">
                세목 {item.subItems.length}
              </span>
            </h2>
            <div className="mt-3 space-y-2">
              {item.subItems.length === 0 && (
                <p className="text-sm text-slate-400">등록된 세목 없음</p>
              )}
              {item.subItems.map((sub) => (
                <div
                  key={sub.id}
                  className="rounded-lg bg-slate-50 px-3 py-2"
                >
                  <p className="text-sm font-medium text-slate-800">
                    {sub.name}
                  </p>
                  {sub.detailItems.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {sub.detailItems.map((d) => (
                        <span
                          key={d.id}
                          className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200"
                        >
                          {d.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
