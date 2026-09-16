-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN "evidenceCode" TEXT;

-- CreateTable
CREATE TABLE "TransactionItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "transactionId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "spec" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL DEFAULT 0,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TransactionItem_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GeneratedDocument" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "transactionId" INTEGER,
    "projectYearId" INTEGER,
    "templateCode" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "content" TEXT,
    "filePath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeneratedDocument_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvidenceRequirement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "budgetSubItemId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "requirement" TEXT NOT NULL,
    "groupKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "EvidenceRequirement_budgetSubItemId_fkey" FOREIGN KEY ("budgetSubItemId") REFERENCES "BudgetSubItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Transaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectYearId" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT '신청',
    "direction" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT,
    "vatRate" INTEGER NOT NULL DEFAULT 10,
    "vatAmount" INTEGER NOT NULL DEFAULT 0,
    "vendor" TEXT,
    "vendorBank" TEXT,
    "vendorAccount" TEXT,
    "vendorHolder" TEXT,
    "purpose" TEXT,
    "paymentMethod" TEXT,
    "deliveryDate" DATETIME,
    "inspectionDate" DATETIME,
    "paymentDueDate" DATETIME,
    "budgetItemId" INTEGER,
    "budgetSubItemId" INTEGER,
    "budgetDetailItemId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_projectYearId_fkey" FOREIGN KEY ("projectYearId") REFERENCES "ProjectYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_budgetItemId_fkey" FOREIGN KEY ("budgetItemId") REFERENCES "BudgetItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_budgetSubItemId_fkey" FOREIGN KEY ("budgetSubItemId") REFERENCES "BudgetSubItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_budgetDetailItemId_fkey" FOREIGN KEY ("budgetDetailItemId") REFERENCES "BudgetDetailItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("amount", "budgetDetailItemId", "budgetItemId", "budgetSubItemId", "createdAt", "date", "description", "direction", "id", "projectYearId", "status", "updatedAt") SELECT "amount", "budgetDetailItemId", "budgetItemId", "budgetSubItemId", "createdAt", "date", "description", "direction", "id", "projectYearId", "status", "updatedAt" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE INDEX "Transaction_projectYearId_idx" ON "Transaction"("projectYearId");
CREATE INDEX "Transaction_budgetItemId_idx" ON "Transaction"("budgetItemId");
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TransactionItem_transactionId_idx" ON "TransactionItem"("transactionId");

-- CreateIndex
CREATE INDEX "GeneratedDocument_transactionId_idx" ON "GeneratedDocument"("transactionId");

-- CreateIndex
CREATE INDEX "GeneratedDocument_projectYearId_idx" ON "GeneratedDocument"("projectYearId");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceRequirement_budgetSubItemId_code_key" ON "EvidenceRequirement"("budgetSubItemId", "code");
