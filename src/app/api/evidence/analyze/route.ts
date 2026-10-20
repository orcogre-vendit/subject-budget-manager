// 증빙 AI 분석 — 브라우저가 S3 staging/ 에 올린 파일 키를 받아 서버가 읽어 Gemini 에 보낸다 (Lambda 요청 한도 6MB 회피)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { idOf } from "@/lib/ids";
import { analyzeEvidence } from "@/lib/gemini/evidence";
import { MAX_UPLOAD_BYTES } from "@/lib/uploadRules";
import { STAGING_PREFIX, getObject, headObject } from "@/lib/storage";

export const runtime = "nodejs";

const ANALYZABLE = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/tiff"]);
const MAX_FILES = 6;
const MAX_TOTAL = 30 * 1024 * 1024;

type KeyIn = { key: string; name: string; type: string };

export async function POST(request: Request) {
  try {
    let body: { projectYearId?: unknown; files?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }
    const projectYearId = idOf(typeof body.projectYearId === "string" ? body.projectYearId : null);
    if (!projectYearId) return NextResponse.json({ error: "잘못된 연차입니다." }, { status: 400 });

    const year = await prisma.projectYear.findUnique({ where: { id: projectYearId }, select: { id: true } });
    if (!year) return NextResponse.json({ error: "연차를 찾을 수 없습니다." }, { status: 404 });

    const files = (Array.isArray(body.files) ? body.files : []).filter(
      (f): f is KeyIn =>
        !!f && typeof f === "object" && typeof (f as KeyIn).key === "string" && (f as KeyIn).key.startsWith(STAGING_PREFIX),
    );
    if (!files.length) return NextResponse.json({ error: "분석할 증빙을 올려주세요." }, { status: 400 });
    if (files.length > MAX_FILES) return NextResponse.json({ error: `한 번에 ${MAX_FILES}개까지 분석할 수 있습니다.` }, { status: 400 });

    const heads = await Promise.all(files.map((f) => headObject(f.key)));
    if (heads.some((h) => !h)) return NextResponse.json({ error: "업로드가 끝나지 않은 파일이 있습니다. 잠시 후 다시 시도하세요." }, { status: 400 });
    const sizes = heads.map((h) => h!.size);
    if (sizes.some((s) => s > MAX_UPLOAD_BYTES)) return NextResponse.json({ error: "개별 파일은 20MB 이하여야 합니다." }, { status: 400 });
    if (sizes.reduce((a, b) => a + b, 0) > MAX_TOTAL)
      return NextResponse.json({ error: "분석 파일 합계는 30MB 이하여야 합니다." }, { status: 400 });
    const mimes = files.map((f, i) => (ANALYZABLE.has(f.type) ? f.type : heads[i]!.contentType ?? ""));
    if (mimes.some((m) => !ANALYZABLE.has(m)))
      return NextResponse.json({ error: "AI 분석은 PDF, JPG, PNG, WEBP, TIFF만 지원합니다." }, { status: 400 });

    const [budgetItems, recent] = await Promise.all([
      prisma.budgetItem.findMany({
        orderBy: { sortOrder: "asc" },
        include: { subItems: { include: { detailItems: true } } },
      }),
      prisma.transaction.findMany({
        where: { projectYearId, direction: "OUT", status: { not: "취소" }, OR: [{ budgetAdjust: null }, { budgetAdjust: false }] },
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
    const encoded = await Promise.all(
      files.map(async (f, i) => ({
        name: typeof f.name === "string" && f.name ? f.name : f.key,
        mimeType: mimes[i],
        data: (await getObject(f.key)).toString("base64"),
      })),
    );

    const draft = await analyzeEvidence(encoded, { categories, recentTransactions: recent });
    return NextResponse.json({ draft });
  } catch (error) {
    const message = error instanceof Error ? error.message : "증빙 분석 중 오류가 발생했습니다.";
    console.error("Evidence analysis error", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
