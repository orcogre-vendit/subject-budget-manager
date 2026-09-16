-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "plannedAmount" INTEGER;

-- CreateTable
CREATE TABLE "RcmsRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "projectYearId" INTEGER NOT NULL,
    "transactionId" INTEGER,
    "matchMethod" TEXT,
    "rcmsProjectNo" TEXT NOT NULL,
    "stage" TEXT,
    "yearNo" INTEGER,
    "registeredAt" DATETIME,
    "useDate" DATETIME,
    "progress" TEXT,
    "execStatus" TEXT,
    "evidenceType" TEXT,
    "budgetPath" TEXT,
    "useAmount" INTEGER NOT NULL DEFAULT 0,
    "supplyAmount" INTEGER NOT NULL DEFAULT 0,
    "vatAmount" INTEGER NOT NULL DEFAULT 0,
    "vendor" TEXT,
    "vendorBizNo" TEXT,
    "bank" TEXT,
    "account" TEXT,
    "holder" TEXT,
    "purpose" TEXT,
    "regType" TEXT,
    "execStage" TEXT,
    "itemName" TEXT,
    "raw" TEXT NOT NULL,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "missingSince" DATETIME,
    CONSTRAINT "RcmsRecord_projectYearId_fkey" FOREIGN KEY ("projectYearId") REFERENCES "ProjectYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RcmsRecord_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RcmsImport" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fileName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "newCount" INTEGER NOT NULL,
    "updatedCount" INTEGER NOT NULL,
    "missingCount" INTEGER NOT NULL,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "skipped" TEXT,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "RcmsRecord_key_key" ON "RcmsRecord"("key");

-- CreateIndex
CREATE UNIQUE INDEX "RcmsRecord_transactionId_key" ON "RcmsRecord"("transactionId");

-- CreateIndex
CREATE INDEX "RcmsRecord_projectYearId_idx" ON "RcmsRecord"("projectYearId");
