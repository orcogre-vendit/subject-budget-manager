// 첨부 표시 이름을 규칙("연번-증빙종류-거래처-비목.ext")대로 다시 붙이는 서버 유틸.
// 거래 수정 액션과 seed(분류 이동 뒤)가 같이 쓴다. seed(tsx)에서도 부르므로 상대 경로 import.
import type { PrismaClient } from "../generated/prisma/client";
import { pickEvidenceFileName } from "./evidenceName";
import { normalizeFileName } from "./uploadRules";

type Db = Pick<PrismaClient, "transaction" | "attachment">;

/** 거래처·비목이 바뀌면 기존 첨부 이름도 규칙대로 다시 붙인다 (첨부 id 순, 같은 종류는 -2, -3 …). 바뀐 첨부 수를 돌려준다 */
export async function renameAttachmentsFor(db: Db, transactionId: number): Promise<number> {
  const tx = await db.transaction.findUnique({
    where: { id: transactionId },
    select: { seqNo: true, vendor: true, budgetItem: { select: { name: true } } },
  });
  if (!tx) return 0;
  const ctx = { seqNo: tx.seqNo ?? null, vendor: tx.vendor ?? null, budgetItem: tx.budgetItem?.name ?? null };
  const atts = await db.attachment.findMany({
    where: { transactionId },
    select: { id: true, fileName: true, originalName: true, evidenceCode: true },
    orderBy: { id: "asc" },
  });
  const taken = new Set<string>();
  let changed = 0;
  for (const a of atts) {
    const originalName = a.originalName ?? normalizeFileName(a.fileName);
    const fileName = pickEvidenceFileName(ctx, a.evidenceCode, originalName, taken);
    if (fileName !== a.fileName || !a.originalName) {
      await db.attachment.update({ where: { id: a.id }, data: { fileName, originalName } });
      changed++;
    }
  }
  return changed;
}
