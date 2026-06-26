-- CreateTable
CREATE TABLE "BudgetItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "BudgetSubItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "budgetItemId" INTEGER NOT NULL,
    CONSTRAINT "BudgetSubItem_budgetItemId_fkey" FOREIGN KEY ("budgetItemId") REFERENCES "BudgetItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BudgetDetailItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "budgetSubItemId" INTEGER NOT NULL,
    CONSTRAINT "BudgetDetailItem_budgetSubItemId_fkey" FOREIGN KEY ("budgetSubItemId") REFERENCES "BudgetSubItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Researcher" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "employeeNo" TEXT,
    "name" TEXT NOT NULL,
    "ssn" TEXT,
    "sciTechNo" TEXT,
    "title" TEXT,
    "affiliation" TEXT,
    "workPhone" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "bankName" TEXT,
    "accountNo" TEXT,
    "homeAddress" TEXT,
    "workAddress" TEXT,
    "researcherRegNo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Project" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "businessName" TEXT,
    "piName" TEXT,
    "piId" INTEGER,
    "managerName" TEXT,
    "hostOrg" TEXT,
    "fundingAgency" TEXT,
    "indirectRate" REAL NOT NULL DEFAULT 0,
    "status" TEXT,
    "region" TEXT,
    "cardType" TEXT,
    "classification" TEXT,
    "category" TEXT,
    "researchType" TEXT,
    "managementGroup" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_piId_fkey" FOREIGN KEY ("piId") REFERENCES "Researcher" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectYear" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "yearNo" INTEGER NOT NULL,
    "label" TEXT,
    "fiscalYear" INTEGER,
    "budgetCash" INTEGER NOT NULL DEFAULT 0,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "ledgerType" TEXT NOT NULL DEFAULT 'PROJECT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectYear_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectYearId" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT '신청',
    "direction" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT,
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

-- CreateTable
CREATE TABLE "Attachment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "transactionId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER NOT NULL DEFAULT 0,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attachment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "BudgetItem_name_key" ON "BudgetItem"("name");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetSubItem_budgetItemId_name_key" ON "BudgetSubItem"("budgetItemId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetDetailItem_budgetSubItemId_name_key" ON "BudgetDetailItem"("budgetSubItemId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectYear_projectId_yearNo_key" ON "ProjectYear"("projectId", "yearNo");

-- CreateIndex
CREATE INDEX "Transaction_projectYearId_idx" ON "Transaction"("projectYearId");

-- CreateIndex
CREATE INDEX "Transaction_budgetItemId_idx" ON "Transaction"("budgetItemId");

-- CreateIndex
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");
