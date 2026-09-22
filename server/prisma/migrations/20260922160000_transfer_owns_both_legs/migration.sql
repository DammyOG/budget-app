-- A transfer becomes one row owning both of its legs, replacing the mutual
-- transferPairId pointers.
--
-- Two pointers allow a half-linked state: leg A pointing at B while B points
-- at nothing, or at a third transaction. Such a leg is excluded from income
-- and spending but has nothing to collapse against, and the code had grown
-- guards for it. One row cannot express half a pair.

CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "outgoingId" TEXT NOT NULL,
    "incomingId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transfer_outgoingId_fkey" FOREIGN KEY ("outgoingId") REFERENCES "Transaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transfer_incomingId_fkey" FOREIGN KEY ("incomingId") REFERENCES "Transaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Joined on both directions, so only pairs that actually point at each other
-- migrate. A one-sided link was never a valid pair and is dropped rather than
-- carried forward. Selecting from the outgoing side inserts each pair once.
INSERT INTO "Transfer" ("id", "outgoingId", "incomingId")
SELECT lower(hex(randomblob(16))), o."id", i."id"
FROM "Transaction" o
JOIN "Transaction" i
  ON o."transferPairId" = i."id" AND i."transferPairId" = o."id"
WHERE o."amountCents" < 0 AND i."amountCents" > 0;

CREATE UNIQUE INDEX "Transfer_outgoingId_key" ON "Transfer"("outgoingId");
CREATE UNIQUE INDEX "Transfer_incomingId_key" ON "Transfer"("incomingId");

-- Drop transferPairId by rebuilding the table.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "kind" TEXT NOT NULL DEFAULT 'expense',
    "kindLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("id","plaidTransactionId","accountId","categoryId","amountCents","absAmountCents","date","name","merchantName","pending","isManual","notes","kind","kindLocked","createdAt","updatedAt")
SELECT "id","plaidTransactionId","accountId","categoryId","amountCents","absAmountCents","date","name","merchantName","pending","isManual","notes","kind","kindLocked","createdAt","updatedAt"
FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE UNIQUE INDEX "Transaction_plaidTransactionId_key" ON "Transaction"("plaidTransactionId");
CREATE INDEX "Transaction_accountId_idx" ON "Transaction"("accountId");
CREATE INDEX "Transaction_categoryId_idx" ON "Transaction"("categoryId");
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");
CREATE INDEX "Transaction_kind_idx" ON "Transaction"("kind");
CREATE INDEX "Transaction_absAmountCents_idx" ON "Transaction"("absAmountCents");
CREATE INDEX "Transaction_accountId_name_amountCents_date_idx" ON "Transaction"("accountId","name","amountCents","date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
