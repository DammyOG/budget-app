-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plaidTransactionId" TEXT,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "amount" REAL NOT NULL,
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
INSERT INTO "new_Transaction" ("accountId", "amount", "categoryId", "createdAt", "date", "id", "isManual", "merchantName", "name", "notes", "pending", "plaidTransactionId", "transferPairId", "updatedAt") SELECT "accountId", "amount", "categoryId", "createdAt", "date", "id", "isManual", "merchantName", "name", "notes", "pending", "plaidTransactionId", "transferPairId", "updatedAt" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE UNIQUE INDEX "Transaction_plaidTransactionId_key" ON "Transaction"("plaidTransactionId");
CREATE INDEX "Transaction_accountId_idx" ON "Transaction"("accountId");
CREATE INDEX "Transaction_categoryId_idx" ON "Transaction"("categoryId");
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");
CREATE INDEX "Transaction_transferPairId_idx" ON "Transaction"("transferPairId");
CREATE INDEX "Transaction_kind_idx" ON "Transaction"("kind");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Backfill "kind" from what the app already knows, so existing rows don't all
-- default to "expense". Order matters: transfers first, then income, so a
-- transfer filed under an income-ish category still ends up a transfer.
-- Only *paired* Zelle is a transfer. An unpaired "Zelle Sent" is money to
-- another person (real spending) and "Zelle Received" is money from one, so
-- those are left to the income/expense rules below.
UPDATE "Transaction" SET "kind" = 'transfer'
WHERE "transferPairId" IS NOT NULL
   OR "categoryId" IN (SELECT "id" FROM "Category" WHERE "name" = 'Transfer');

UPDATE "Transaction" SET "kind" = 'income'
WHERE "kind" = 'expense'
  AND "categoryId" IN (SELECT "id" FROM "Category" WHERE "isIncome" = true);

-- Anything still marked expense but flowing inward is a refund, which is a
-- negative expense against its own category rather than income.
