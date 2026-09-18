-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TransactionItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "transactionId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "spec" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" TEXT NOT NULL DEFAULT '0',
    "amount" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TransactionItem_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TransactionItem" ("amount", "id", "name", "quantity", "sortOrder", "spec", "transactionId", "unitPrice") SELECT "amount", "id", "name", "quantity", "sortOrder", "spec", "transactionId", "unitPrice" FROM "TransactionItem";
DROP TABLE "TransactionItem";
ALTER TABLE "new_TransactionItem" RENAME TO "TransactionItem";
CREATE INDEX "TransactionItem_transactionId_idx" ON "TransactionItem"("transactionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
