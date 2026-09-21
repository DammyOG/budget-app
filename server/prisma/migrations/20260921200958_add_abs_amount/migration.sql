-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plaidTransactionId" TEXT,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "amount" REAL NOT NULL,
    "absAmount" REAL NOT NULL DEFAULT 0,
    "date" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "merchantName" TEXT,
    "pending" BOOLEAN NOT NULL DEFAULT false,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "transferPairId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'expense',
    "kindLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("accountId", "amount", "categoryId", "createdAt", "date", "id", "isManual", "kind", "kindLocked", "merchantName", "name", "notes", "pending", "plaidTransactionId", "transferPairId", "updatedAt") SELECT "accountId", "amount", "categoryId", "createdAt", "date", "id", "isManual", "kind", "kindLocked", "merchantName", "name", "notes", "pending", "plaidTransactionId", "transferPairId", "updatedAt" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE UNIQUE INDEX "Transaction_plaidTransactionId_key" ON "Transaction"("plaidTransactionId");
CREATE INDEX "Transaction_accountId_idx" ON "Transaction"("accountId");
CREATE INDEX "Transaction_categoryId_idx" ON "Transaction"("categoryId");
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");
CREATE INDEX "Transaction_transferPairId_idx" ON "Transaction"("transferPairId");
CREATE INDEX "Transaction_kind_idx" ON "Transaction"("kind");
CREATE INDEX "Transaction_absAmount_idx" ON "Transaction"("absAmount");
CREATE INDEX "Transaction_accountId_name_amount_date_idx" ON "Transaction"("accountId", "name", "amount", "date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Backfill: existing rows copied across with the column's 0 default, which
-- would sort every pre-existing transaction as if it were $0.
UPDATE "Transaction" SET "absAmount" = abs("amount");
