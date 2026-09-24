import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { analyzeEvidence } from "@/lib/gemini/evidence";
import { MAX_UPLOAD_BYTES } from "@/lib/uploadRules";

export const runtime = "nodejs";

const ANALYZABLE = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/tiff"]);
const MAX_FILES = 6;
const MAX_TOTAL = 30 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const fd = await request.formData();
    const projectYearId = Number(fd.get("projectYearId"));
    if (!projectYearId) return NextResponse.json({ error: "잘못된 연차입니다." }, { status: 400 });

    const year = await prisma.projectYear.findUnique({ where: { id: projectYearId }, select: { id: true } });
    if (!year) return NextResponse.json({ error: "연차를 찾을 수 없습니다." }, { status: 404 });

    const files = fd.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
    if (!files.length) return NextResponse.json({ error: "분석할 증빙을 올려주세요." }, { status: 400 });
    if (files.length > MAX_FILES) return NextResponse.json({ error: `한 번에 ${MAX_FILES}개까지 분석할 수 있습니다.` }, { status: 400 });
    if (files.some((file) => file.size > MAX_UPLOAD_BYTES))
      return NextResponse.json({ error: "개별 파일은 20MB 이하여야 합니다." }, { status: 400 });
    if (files.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL)
      return NextResponse.json({ error: "분석 파일 합계는 30MB 이하여야 합니다." }, { status: 400 });
    if (files.some((file) => !ANALYZABLE.has(file.type)))
      return NextResponse.json({ error: "AI 분석은 PDF, JPG, PNG, WEBP, TIFF만 지원합니다." }, { status: 400 });

    const [budgetItems, recent] = await Promise.all([
      prisma.budgetItem.findMany({
        orderBy: { sortOrder: "asc" },
        include: { subItems: { include: { detailItems: true } } },
      }),
      prisma.transaction.findMany({
        where: { projectYearId, direction: "OUT", status: { not: "취소" } },
        orderBy: { date: "desc" },
        take: 10,
        select: {
          vendor: true,
          description: true,
          purpose: true,
          paymentMethod: true,
          installLocation: true,
          budgetItem: { select: { name: true } },
          budgetSubItem: { select: { name: true } },
          budgetDetailItem: { select: { name: true } },
          items: { orderBy: { sortOrder: "asc" }, take: 5, select: { name: true, spec: true } },
        },
      }),
    ]);

    const categories = budgetItems.flatMap((item) =>
      item.subItems.length
        ? item.subItems.flatMap((sub) =>
            sub.detailItems.length
              ? sub.detailItems.map((detail) => `${item.name} > ${sub.name} > ${detail.name}`)
              : [`${item.name} > ${sub.name}`],
          )
        : [item.name],
    );
    const encoded = await Promise.all(files.map(async (file) => ({
      name: file.name,
      mimeType: file.type,
      data: Buffer.from(await file.arrayBuffer()).toString("base64"),
    })));

    const draft = await analyzeEvidence(encoded, { categories, recentTransactions: recent });
    return NextResponse.json({ draft });
  } catch (error) {
    const message = error instanceof Error ? error.message : "증빙 분석 중 오류가 발생했습니다.";
    console.error("Evidence analysis error", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
