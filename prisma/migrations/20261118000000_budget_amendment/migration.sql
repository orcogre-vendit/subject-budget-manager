BEGIN;

ALTER TABLE "Transaction" ADD COLUMN     "amendmentId" UUID;

COMMIT;

BEGIN;

CREATE TABLE "BudgetAmendment" (
    "id" UUID NOT NULL,
    "projectYearId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetAmendment_pkey" PRIMARY KEY ("id")
);

COMMIT;

BEGIN;

CREATE TABLE "BudgetAmendmentLine" (
    "id" UUID NOT NULL,
    "amendmentId" UUID NOT NULL,
    "itemName" TEXT NOT NULL,
    "subName" TEXT,
    "detailName" TEXT,
    "fundType" TEXT NOT NULL,
    "inLedger" BOOLEAN,
    "beforeAmt" INTEGER NOT NULL,
    "afterAmt" INTEGER NOT NULL,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BudgetAmendmentLine_pkey" PRIMARY KEY ("id")
);

COMMIT;

BEGIN;

CREATE INDEX ASYNC "BudgetAmendment_projectYearId_idx" ON "BudgetAmendment"("projectYearId");

COMMIT;

BEGIN;

CREATE INDEX ASYNC "BudgetAmendmentLine_amendmentId_idx" ON "BudgetAmendmentLine"("amendmentId");

COMMIT;

BEGIN;

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_amendmentId_fkey" FOREIGN KEY ("amendmentId") REFERENCES "BudgetAmendment"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

COMMIT;

BEGIN;

ALTER TABLE "BudgetAmendment" ADD CONSTRAINT "BudgetAmendment_projectYearId_fkey" FOREIGN KEY ("projectYearId") REFERENCES "ProjectYear"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

COMMIT;

BEGIN;

ALTER TABLE "BudgetAmendmentLine" ADD CONSTRAINT "BudgetAmendmentLine_amendmentId_fkey" FOREIGN KEY ("amendmentId") REFERENCES "BudgetAmendment"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

COMMIT;
