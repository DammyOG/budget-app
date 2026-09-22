-- Money moves from REAL (float) to INTEGER cents.
--
-- Floats can't represent 0.1 exactly, so sums drifted and any exact comparison
-- needed a tolerance — transfer matching carried `< 0.01` guards purely to work
-- around it. Cents are exact, and the column names carry the unit because an
-- Int on its own can't say whether it holds dollars or cents.
--
-- ROUND before CAST: CAST truncates, and 12.99 * 100 is 1298.9999... in
-- floating point, which would silently become 1298.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plaidItemId" TEXT,
    "plaidAccountId" TEXT,
    "name" TEXT NOT NULL,
    "officialName" TEXT,
    "institutionName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subtype" TEXT,
    "mask" TEXT,
    "currentBalanceCents" INTEGER,
    "availableBalanceCents" INTEGER,
    "isoCurrencyCode" TEXT DEFAULT 'USD',
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_plaidItemId_fkey" FOREIGN KEY ("plaidItemId") REFERENCES "PlaidItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Account" ("id","plaidItemId","plaidAccountId","name","officialName","institutionName","type","subtype","mask","currentBalanceCents","availableBalanceCents","isoCurrencyCode","isManual","archivedAt","createdAt","updatedAt")
SELECT "id","plaidItemId","plaidAccountId","name","officialName","institutionName","type","subtype","mask",
       CASE WHEN "currentBalance" IS NULL THEN NULL ELSE CAST(ROUND("currentBalance" * 100) AS INTEGER) END,
       CASE WHEN "availableBalance" IS NULL THEN NULL ELSE CAST(ROUND("availableBalance" * 100) AS INTEGER) END,
       "isoCurrencyCode","isManual","archivedAt","createdAt","updatedAt"
FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
CREATE UNIQUE INDEX "Account_plaidAccountId_key" ON "Account"("plaidAccountId");

CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plaidTransactionId" TEXT,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "absAmountCents" INTEGER NOT NULL DEFAULT 0,
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
INSERT INTO "new_Transaction" ("id","plaidTransactionId","accountId","categoryId","amountCents","absAmountCents","date","name","merchantName","pending","isManual","notes","transferPairId","kind","kindLocked","createdAt","updatedAt")
SELECT "id","plaidTransactionId","accountId","categoryId",
       CAST(ROUND("amount" * 100) AS INTEGER),
       -- Recomputed from amount rather than converted from absAmount, so the
       -- two can't disagree if absAmount was ever stale.
       ABS(CAST(ROUND("amount" * 100) AS INTEGER)),
       "date","name","merchantName","pending","isManual","notes","transferPairId","kind","kindLocked","createdAt","updatedAt"
FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE UNIQUE INDEX "Transaction_plaidTransactionId_key" ON "Transaction"("plaidTransactionId");
CREATE INDEX "Transaction_accountId_idx" ON "Transaction"("accountId");
CREATE INDEX "Transaction_categoryId_idx" ON "Transaction"("categoryId");
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");
CREATE INDEX "Transaction_transferPairId_idx" ON "Transaction"("transferPairId");
CREATE INDEX "Transaction_kind_idx" ON "Transaction"("kind");
CREATE INDEX "Transaction_absAmountCents_idx" ON "Transaction"("absAmountCents");
CREATE INDEX "Transaction_accountId_name_amountCents_date_idx" ON "Transaction"("accountId","name","amountCents","date");

CREATE TABLE "new_Budget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Budget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Budget" ("id","categoryId","month","amountCents","createdAt","updatedAt")
SELECT "id","categoryId","month", CAST(ROUND("amount" * 100) AS INTEGER), "createdAt","updatedAt" FROM "Budget";
DROP TABLE "Budget";
ALTER TABLE "new_Budget" RENAME TO "Budget";
CREATE UNIQUE INDEX "Budget_categoryId_month_key" ON "Budget"("categoryId","month");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
