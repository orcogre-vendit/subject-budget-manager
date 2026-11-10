BEGIN;

ALTER TABLE "ProjectYear" ADD COLUMN "personnelCashTarget" INTEGER;

COMMIT;

BEGIN;

ALTER TABLE "ProjectYear" ADD COLUMN "personnelInKindTarget" INTEGER;

COMMIT;

BEGIN;

CREATE TABLE "Participation" (
    "id" UUID NOT NULL,
    "projectYearId" UUID NOT NULL,
    "researcherId" UUID NOT NULL,
    "fundType" TEXT NOT NULL,
    "role" TEXT,
    "startMonth" TEXT NOT NULL,
    "endMonth" TEXT NOT NULL,
    "baseSalary" INTEGER NOT NULL,
    "rateBp" INTEGER NOT NULL,
    "rateLocked" BOOLEAN,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Participation_pkey" PRIMARY KEY ("id")
);

COMMIT;

BEGIN;

CREATE INDEX ASYNC "Participation_projectYearId_idx" ON "Participation"("projectYearId");

COMMIT;

BEGIN;

CREATE INDEX ASYNC "Participation_researcherId_idx" ON "Participation"("researcherId");

COMMIT;

BEGIN;

ALTER TABLE "Participation" ADD CONSTRAINT "Participation_projectYearId_fkey" FOREIGN KEY ("projectYearId") REFERENCES "ProjectYear"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

COMMIT;

BEGIN;

ALTER TABLE "Participation" ADD CONSTRAINT "Participation_researcherId_fkey" FOREIGN KEY ("researcherId") REFERENCES "Researcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

COMMIT;
