"use server";

// 참여 계획 저장 — 연차 단위로 통째로 바꾼다(계획 데이터라 장부와 달리 덮어써도 된다). 금액은 저장하지 않고 매번 계산한다.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { idOf } from "@/lib/ids";
import { FULL_BP, monthsBetween, type FundType } from "@/lib/participation";

export type SaveResult = { ok: true; savedAt: string } | { ok: false; error: string };

type RowIn = {
  researcherId: string;
  fundType: FundType;
  role: string;
  startMonth: string;
  endMonth: string;
  baseSalary: number;
  rateBp: number;
  locked: boolean;
  amountOverride?: number | null;
};

const intOrNull = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
};

export async function saveParticipation(input: {
  projectYearId: string;
  cashTarget: number | null;
  inKindTarget: number | null;
  rows: RowIn[];
}): Promise<SaveResult> {
  const projectYearId = idOf(input.projectYearId);
  if (!projectYearId) return { ok: false, error: "잘못된 연차입니다." };
  const cash = intOrNull(input.cashTarget);
  const inKind = intOrNull(input.inKindTarget);
  if (Number.isNaN(cash) || Number.isNaN(inKind)) return { ok: false, error: "목표 금액은 0 이상의 정수(원)여야 합니다." };

  const rows = Array.isArray(input.rows) ? input.rows : [];
  const ids = new Set((await prisma.researcher.findMany({ select: { id: true } })).map((r) => r.id));
  for (const [i, r] of rows.entries()) {
    const n = i + 1;
    if (!idOf(r.researcherId) || !ids.has(r.researcherId)) return { ok: false, error: `${n}번째 줄: 연구원을 고르세요.` };
    if (r.fundType !== "CASH" && r.fundType !== "IN_KIND") return { ok: false, error: `${n}번째 줄: 현금/현물을 고르세요.` };
    if (!monthsBetween(r.startMonth, r.endMonth)) return { ok: false, error: `${n}번째 줄: 참여기간(시작월·종료월)이 올바르지 않습니다.` };
    if (!Number.isInteger(r.baseSalary) || r.baseSalary < 0) return { ok: false, error: `${n}번째 줄: 기준연봉은 0 이상의 정수(원)여야 합니다.` };
    if (!Number.isInteger(r.rateBp) || r.rateBp < 0 || r.rateBp > FULL_BP) return { ok: false, error: `${n}번째 줄: 참여율은 0~100% 여야 합니다.` };
    if (r.amountOverride != null && (!Number.isInteger(r.amountOverride) || r.amountOverride < 0))
      return { ok: false, error: `${n}번째 줄: 끝전 맞춤 금액이 올바르지 않습니다.` };
  }

  const year = await prisma.projectYear.findUnique({ where: { id: projectYearId }, select: { id: true } });
  if (!year) return { ok: false, error: "연차를 찾을 수 없습니다." };

  await prisma.$transaction([
    prisma.participation.deleteMany({ where: { projectYearId } }),
    prisma.participation.createMany({
      data: rows.map((r, i) => ({
        projectYearId,
        researcherId: r.researcherId,
        fundType: r.fundType,
        role: r.role?.trim() || null,
        startMonth: r.startMonth,
        endMonth: r.endMonth,
        baseSalary: r.baseSalary,
        rateBp: r.rateBp,
        rateLocked: r.locked || null,
        amountOverride: r.amountOverride ?? null,
        sortOrder: i,
      })),
    }),
    prisma.projectYear.update({
      where: { id: projectYearId },
      data: { personnelCashTarget: cash, personnelInKindTarget: inKind },
    }),
  ]);
  revalidatePath("/researchers/participation");
  return { ok: true, savedAt: new Date().toISOString() };
}

export type QuickProjectState = { error?: string };

/**
 * 참여율 계산용 과제 빠른 추가 — 과제 + 1년차를 한 번에 만들고 계산 화면으로 보낸다.
 * 협약 준비 중인 새 과제(장부 거래가 아직 없음)를 바로 계산할 수 있게. 나머지 정보는 과제 수정 화면에서 채운다.
 */
export async function quickCreateProject(_prev: QuickProjectState, fd: FormData): Promise<QuickProjectState> {
  const get = (k: string) => String(fd.get(k) ?? "").trim();
  const code = get("code");
  const name = get("name");
  const start = get("startDate");
  const end = get("endDate");
  if (!name) return { error: "과제명을 넣으세요." };
  if (!start || !end || end < start) return { error: "1년차 시작일·종료일을 확인하세요." };
  if (code && (await prisma.project.findFirst({ where: { code } }))) return { error: `과제번호 ${code} 는 이미 있습니다.` };

  const piName = get("piName") || null;
  const year = await prisma.$transaction(async (db) => {
    const project = await db.project.create({
      data: {
        code: code || null,
        name,
        businessName: get("businessName") || null,
        hostOrg: get("hostOrg") || null,
        fundingAgency: get("fundingAgency") || null,
        piName,
        status: "준비",
        startDate: get("projectStart") ? new Date(get("projectStart")) : new Date(start),
        endDate: get("projectEnd") ? new Date(get("projectEnd")) : null,
      },
    });
    return db.projectYear.create({
      data: {
        projectId: project.id,
        yearNo: 1,
        label: get("yearLabel") || "1년차",
        startDate: new Date(start),
        endDate: new Date(end),
      },
    });
  });
  revalidatePath("/projects");
  revalidatePath("/researchers/participation");
  redirect(`/researchers/participation?year=${year.id}`);
}
