-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN "originalName" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "seqNo" INTEGER;

-- CreateIndex
CREATE INDEX "Transaction_projectYearId_seqNo_idx" ON "Transaction"("projectYearId", "seqNo");

-- 기존 거래에 연번(seqNo) 부여: 연차 안에서 (날짜, id) 순. 이후 생성분은 앱이 max+1 로 부여
UPDATE "Transaction" SET "seqNo" = (
  SELECT rn FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY "projectYearId" ORDER BY "date", id) AS rn FROM "Transaction"
  ) t WHERE t.id = "Transaction".id
) WHERE "seqNo" IS NULL;
