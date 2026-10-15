BEGIN;

CREATE SCHEMA IF NOT EXISTS "public";

COMMIT;

BEGIN;

CREATE TABLE "BudgetItem" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BudgetItem_pkey" PRIMARY KEY ("id")
);

COMMIT;

BEGIN;

CREATE TABLE "BudgetSubItem" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "budgetItemId" UUID NOT NULL,

    CONSTRAINT "BudgetSubItem_pkey" PRIMARY KEY ("id")
);

COMMIT;

BEGIN;

CREATE TABLE "BudgetDetailItem" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "budgetSubItemId" UUID NOT NULL,

    CONSTRAINT "BudgetDetailItem_pkey" PRIMARY KEY ("id")
);

COMMIT;

BEGIN;

CREATE TABLE "Researcher" (
    "id" UUID NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Researcher_pkey" PRIMARY KEY ("id")
);

COMMIT;

BEGIN;

CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "businessName" TEXT,
    "piName" TEXT,
    "piId" UUID,
    "managerName" TEXT,
    "hostOrg" TEXT,
    "fundingAgency" TEXT,
    "indirectRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT,
    "region" TEXT,
    "cardType" TEXT,
    "classification" TEXT,
    "category" TEXT,
    "researchType" TEXT,
    "managementGroup" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

COMMIT;

BEGIN;

CREATE TABLE "ProjectYear" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "yearNo" INTEGER NOT NULL,
    "label" TEXT,
    "fiscalYear" INTEGER,
    "budgetCash" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "ledgerType" TEXT NOT NULL DEFAULT 'PROJECT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectYear_pkey" PRIMARY KEY ("id")
);

COMMIT;

BEGIN;

CREATE TABLE "Transaction" (
    "id" UUID NOT NULL,
    "projectYearId" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
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
    "deliveryDate" TIMESTAMP(3),
    "inspectionDate" TIMESTAMP(3),
    "installLocation" TEXT,
    "paymentDueDate" TIMESTAMP(3),
    "budgetItemId" UUID,
    "budgetSubItemId" UUID,
    "budgetDetailItemId" UUID,
    "plannedAmount" INTEGER,
    "seqNo" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

COMMIT;

BEGIN;

CREATE TABLE "RcmsRecord" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "projectYearId" UUID NOT NULL,
    "transactionId" UUID,
    "matchMethod" TEXT,
    "rcmsProjectNo" TEXT NOT NULL,
    "stage" TEXT,
    "yearNo" INTEGER,
    "registeredAt" TIMESTAMP(3),
    "useDate" TIMESTAMP(3),
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
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "missingSince" TIMESTAMP(3),

    CONSTRAINT "RcmsRecord_pkey" PRIMARY KEY ("id")
);

COMMIT;

BEGIN;

CREATE TABLE "RcmsImport" (
    "id" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "newCount" INTEGER NOT NULL,
    "updatedCount" INTEGER NOT NULL,
    "missingCount" INTEGER NOT NULL,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "skipped" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RcmsImport_pkey" PRIMARY KEY ("id")
);

COMMIT;

BEGIN;

CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER NOT NULL DEFAULT 0,
    "evidenceCode" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

COMMIT;

BEGIN;

CREATE TABLE "TransactionItem" (
    "id" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "spec" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" TEXT NOT NULL DEFAULT '0',
    "amount" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TransactionItem_pkey" PRIMARY KEY ("id")
);

COMMIT;

BEGIN;

CREATE TABLE "GeneratedDocument" (
    "id" UUID NOT NULL,
    "transactionId" UUID,
    "projectYearId" UUID,
    "templateCode" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "content" TEXT,
    "filePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedDocument_pkey" PRIMARY KEY ("id")
);

COMMIT;

BEGIN;

CREATE TABLE "EvidenceRequirement" (
    "id" UUID NOT NULL,
    "budgetSubItemId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "requirement" TEXT NOT NULL,
    "groupKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EvidenceRequirement_pkey" PRIMARY KEY ("id")
);

COMMIT;

BEGIN;

CREATE UNIQUE INDEX ASYNC "BudgetItem_name_key" ON "BudgetItem"("name");

COMMIT;

BEGIN;

CREATE UNIQUE INDEX ASYNC "BudgetSubItem_budgetItemId_name_key" ON "BudgetSubItem"("budgetItemId", "name");

COMMIT;

BEGIN;

CREATE UNIQUE INDEX ASYNC "BudgetDetailItem_budgetSubItemId_name_key" ON "BudgetDetailItem"("budgetSubItemId", "name");

COMMIT;

BEGIN;

CREATE UNIQUE INDEX ASYNC "Project_code_key" ON "Project"("code");

COMMIT;

BEGIN;

CREATE UNIQUE INDEX ASYNC "ProjectYear_projectId_yearNo_key" ON "ProjectYear"("projectId", "yearNo");

COMMIT;

BEGIN;

CREATE INDEX ASYNC "Transaction_projectYearId_idx" ON "Transaction"("projectYearId");

COMMIT;

BEGIN;

CREATE INDEX ASYNC "Transaction_budgetItemId_idx" ON "Transaction"("budgetItemId");

COMMIT;

BEGIN;

CREATE INDEX ASYNC "Transaction_date_idx" ON "Transaction"("date");

COMMIT;

BEGIN;

CREATE INDEX ASYNC "Transaction_projectYearId_seqNo_idx" ON "Transaction"("projectYearId", "seqNo");

COMMIT;

BEGIN;

CREATE UNIQUE INDEX ASYNC "RcmsRecord_key_key" ON "RcmsRecord"("key");

COMMIT;

BEGIN;

CREATE UNIQUE INDEX ASYNC "RcmsRecord_transactionId_key" ON "RcmsRecord"("transactionId");

COMMIT;

BEGIN;

CREATE INDEX ASYNC "RcmsRecord_projectYearId_idx" ON "RcmsRecord"("projectYearId");

COMMIT;

BEGIN;

CREATE INDEX ASYNC "TransactionItem_transactionId_idx" ON "TransactionItem"("transactionId");

COMMIT;

BEGIN;

CREATE INDEX ASYNC "GeneratedDocument_transactionId_idx" ON "GeneratedDocument"("transactionId");

COMMIT;

BEGIN;

CREATE INDEX ASYNC "GeneratedDocument_projectYearId_idx" ON "GeneratedDocument"("projectYearId");

COMMIT;

BEGIN;

CREATE UNIQUE INDEX ASYNC "EvidenceRequirement_budgetSubItemId_code_key" ON "EvidenceRequirement"("budgetSubItemId", "code");

COMMIT;

BEGIN;

ALTER TABLE "BudgetSubItem" ADD CONSTRAINT "BudgetSubItem_budgetItemId_fkey" FOREIGN KEY ("budgetItemId") REFERENCES "BudgetItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

COMMIT;

BEGIN;

ALTER TABLE "BudgetDetailItem" ADD CONSTRAINT "BudgetDetailItem_budgetSubItemId_fkey" FOREIGN KEY ("budgetSubItemId") REFERENCES "BudgetSubItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

COMMIT;

BEGIN;

ALTER TABLE "Project" ADD CONSTRAINT "Project_piId_fkey" FOREIGN KEY ("piId") REFERENCES "Researcher"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

COMMIT;

BEGIN;

ALTER TABLE "ProjectYear" ADD CONSTRAINT "ProjectYear_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

COMMIT;

BEGIN;

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_projectYearId_fkey" FOREIGN KEY ("projectYearId") REFERENCES "ProjectYear"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

COMMIT;

BEGIN;

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_budgetItemId_fkey" FOREIGN KEY ("budgetItemId") REFERENCES "BudgetItem"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

COMMIT;

BEGIN;

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_budgetSubItemId_fkey" FOREIGN KEY ("budgetSubItemId") REFERENCES "BudgetSubItem"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

COMMIT;

BEGIN;

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_budgetDetailItemId_fkey" FOREIGN KEY ("budgetDetailItemId") REFERENCES "BudgetDetailItem"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

COMMIT;

BEGIN;

ALTER TABLE "RcmsRecord" ADD CONSTRAINT "RcmsRecord_projectYearId_fkey" FOREIGN KEY ("projectYearId") REFERENCES "ProjectYear"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

COMMIT;

BEGIN;

ALTER TABLE "RcmsRecord" ADD CONSTRAINT "RcmsRecord_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

COMMIT;

BEGIN;

ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

COMMIT;

BEGIN;

ALTER TABLE "TransactionItem" ADD CONSTRAINT "TransactionItem_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

COMMIT;

BEGIN;

ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

COMMIT;

BEGIN;

ALTER TABLE "EvidenceRequirement" ADD CONSTRAINT "EvidenceRequirement_budgetSubItemId_fkey" FOREIGN KEY ("budgetSubItemId") REFERENCES "BudgetSubItem"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

COMMIT;
