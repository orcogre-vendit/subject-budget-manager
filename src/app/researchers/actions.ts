"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { RESEARCHER_FIELDS } from "./fields";

export type FormState = {
  fieldErrors?: Record<string, string>;
  error?: string;
  values?: Record<string, string | null>; // 검증 실패 시 입력값 보존
};

/** FormData → { key: trimmed string | null } */
function parseForm(formData: FormData): Record<string, string | null> {
  const data: Record<string, string | null> = {};
  for (const f of RESEARCHER_FIELDS) {
    const raw = ((formData.get(f.key) as string | null) ?? "").trim();
    data[f.key] = raw === "" ? null : raw;
  }
  return data;
}

function validate(data: Record<string, string | null>): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!data.name) errs.name = "이름은 필수입니다.";
  if (data.email && !z.email().safeParse(data.email).success) {
    errs.email = "이메일 형식이 올바르지 않습니다.";
  }
  return errs;
}

export async function createResearcher(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const data = parseForm(formData);
  const fieldErrors = validate(data);
  if (Object.keys(fieldErrors).length) return { fieldErrors, values: data };

  await prisma.researcher.create({
    data: { ...data, name: data.name! } as Prisma.ResearcherUncheckedCreateInput,
  });
  revalidatePath("/researchers");
  redirect("/researchers");
}

export async function updateResearcher(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = Number(formData.get("id"));
  if (!id) return { error: "잘못된 연구원 ID입니다." };

  const data = parseForm(formData);
  const fieldErrors = validate(data);
  if (Object.keys(fieldErrors).length) return { fieldErrors, values: data };

  await prisma.researcher.update({
    where: { id },
    data: { ...data, name: data.name! } as Prisma.ResearcherUncheckedUpdateInput,
  });
  revalidatePath("/researchers");
  revalidatePath(`/researchers/${id}/edit`);
  redirect("/researchers");
}

export async function deleteResearcher(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!id) return;
  await prisma.researcher.delete({ where: { id } });
  revalidatePath("/researchers");
}
