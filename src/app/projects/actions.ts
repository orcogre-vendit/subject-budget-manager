"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { deleteUpload } from "@/lib/uploads";
import {
  PROJECT_FIELDS,
  PROJECT_YEAR_FIELDS,
  type ProjectField,
} from "./fields";

/** 주어진 조건의 거래에 속한 첨부 파일을 디스크에서 제거 (DB는 cascade로 삭제됨) */
async function purgeAttachmentFiles(where: Prisma.AttachmentWhereInput) {
  const atts = await prisma.attachment.findMany({
    where,
    select: { storedName: true },
  });
  await Promise.all(atts.map((a) => deleteUpload(a.storedName)));
}

export type FormState = {
  fieldErrors?: Record<string, string>;
  error?: string;
  values?: Record<string, string>; // 검증 실패 시 입력값(문자열) 보존
};

/** FormData → 문자열 맵 (체크박스는 "on"|""). 입력값 보존/재표시용 */
function rawForm(fields: ProjectField[], fd: FormData): Record<string, string> {
  const r: Record<string, string> = {};
  for (const f of fields) {
    if (f.type === "checkbox") {
      r[f.key] = fd.get(f.key) === "on" ? "on" : "";
    } else {
      let s = ((fd.get(f.key) as string | null) ?? "").trim();
      if (f.type === "number") s = s.replace(/,/g, ""); // 금액 등 콤마 제거
      r[f.key] = s;
    }
  }
  return r;
}

/** 문자열 맵 → 타입 변환된 Prisma 데이터 */
function toData(
  fields: ProjectField[],
  raw: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = raw[f.key];
    switch (f.type) {
      case "checkbox":
        out[f.key] = v === "on";
        break;
      case "number":
        out[f.key] = v === "" ? 0 : Number(v);
        break;
      case "date":
        out[f.key] = v === "" ? null : new Date(v);
        break;
      default:
        out[f.key] = v === "" ? null : v;
    }
  }
  return out;
}

function isUniqueError(e: unknown): e is Prisma.PrismaClientKnownRequestError {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

// ---------- 과제 ----------

function validateProject(raw: Record<string, string>): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!raw.name) errs.name = "과제명은 필수입니다.";
  if (raw.indirectRate) {
    const n = Number(raw.indirectRate);
    if (Number.isNaN(n) || n < 0 || n > 100)
      errs.indirectRate = "간접징수비율은 0~100 사이여야 합니다.";
  }
  if (raw.startDate && raw.endDate && raw.endDate < raw.startDate) {
    errs.endDate = "종료일은 시작일 이후여야 합니다.";
  }
  return errs;
}

export async function createProject(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const raw = rawForm(PROJECT_FIELDS, formData);
  const fieldErrors = validateProject(raw);
  if (Object.keys(fieldErrors).length) return { fieldErrors, values: raw };

  let created;
  try {
    created = await prisma.project.create({
      data: toData(PROJECT_FIELDS, raw) as Prisma.ProjectUncheckedCreateInput,
    });
  } catch (e) {
    if (isUniqueError(e))
      return { fieldErrors: { code: "이미 존재하는 과제번호입니다." }, values: raw };
    throw e;
  }
  revalidatePath("/projects");
  redirect(`/projects/${created.id}`);
}

export async function updateProject(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = Number(formData.get("id"));
  if (!id) return { error: "잘못된 과제 ID입니다." };

  const raw = rawForm(PROJECT_FIELDS, formData);
  const fieldErrors = validateProject(raw);
  if (Object.keys(fieldErrors).length) return { fieldErrors, values: raw };

  try {
    await prisma.project.update({
      where: { id },
      data: toData(PROJECT_FIELDS, raw) as Prisma.ProjectUncheckedUpdateInput,
    });
  } catch (e) {
    if (isUniqueError(e))
      return { fieldErrors: { code: "이미 존재하는 과제번호입니다." }, values: raw };
    throw e;
  }
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  redirect(`/projects/${id}`);
}

export async function deleteProject(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!id) return;
  await purgeAttachmentFiles({ transaction: { projectYear: { projectId: id } } });
  await prisma.project.delete({ where: { id } });
  revalidatePath("/projects");
  redirect("/projects");
}

// ---------- 연차 ----------

function validateYear(raw: Record<string, string>): Record<string, string> {
  const errs: Record<string, string> = {};
  const yearNo = Number(raw.yearNo);
  if (!raw.yearNo || Number.isNaN(yearNo) || yearNo < 1)
    errs.yearNo = "연차는 1 이상의 숫자여야 합니다.";
  if (raw.budgetCash && Number(raw.budgetCash) < 0)
    errs.budgetCash = "예산은 음수일 수 없습니다.";
  if (raw.startDate && raw.endDate && raw.endDate < raw.startDate)
    errs.endDate = "종료일은 시작일 이후여야 합니다.";
  return errs;
}

export async function createProjectYear(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const projectId = Number(formData.get("projectId"));
  if (!projectId) return { error: "잘못된 과제 ID입니다." };

  const raw = rawForm(PROJECT_YEAR_FIELDS, formData);
  const fieldErrors = validateYear(raw);
  if (Object.keys(fieldErrors).length) return { fieldErrors, values: raw };

  try {
    await prisma.projectYear.create({
      data: {
        ...toData(PROJECT_YEAR_FIELDS, raw),
        projectId,
      } as Prisma.ProjectYearUncheckedCreateInput,
    });
  } catch (e) {
    if (isUniqueError(e))
      return { fieldErrors: { yearNo: "이미 등록된 연차입니다." }, values: raw };
    throw e;
  }
  revalidatePath(`/projects/${projectId}`);
  return { values: {} }; // 폼 초기화
}

export async function updateProjectYear(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = Number(formData.get("id"));
  const projectId = Number(formData.get("projectId"));
  if (!id || !projectId) return { error: "잘못된 연차 ID입니다." };

  const raw = rawForm(PROJECT_YEAR_FIELDS, formData);
  const fieldErrors = validateYear(raw);
  if (Object.keys(fieldErrors).length) return { fieldErrors, values: raw };

  try {
    await prisma.projectYear.update({
      where: { id },
      data: toData(PROJECT_YEAR_FIELDS, raw) as Prisma.ProjectYearUncheckedUpdateInput,
    });
  } catch (e) {
    if (isUniqueError(e))
      return { fieldErrors: { yearNo: "이미 등록된 연차입니다." }, values: raw };
    throw e;
  }
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}

export async function deleteProjectYear(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const projectId = Number(formData.get("projectId"));
  if (!id) return;
  await purgeAttachmentFiles({ transaction: { projectYearId: id } });
  await prisma.projectYear.delete({ where: { id } });
  if (projectId) revalidatePath(`/projects/${projectId}`);
}
