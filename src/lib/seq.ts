import { prisma } from "@/lib/prisma";

/** 연차 안의 다음 거래 연번(1부터). 삭제된 번호는 재사용하지 않는다 (max+1). 단일 사용자 전제 */
export async function nextSeqNo(projectYearId: number): Promise<number> {
  const agg = await prisma.transaction.aggregate({ where: { projectYearId }, _max: { seqNo: true } });
  return (agg._max.seqNo ?? 0) + 1;
}
