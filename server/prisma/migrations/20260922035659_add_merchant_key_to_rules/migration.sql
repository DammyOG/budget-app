/*
  Warnings:

  - Added the required column `merchantKey` to the `CategorizationRule` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CategorizationRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pattern" TEXT NOT NULL,
    "merchantKey" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 100,
    "timesUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CategorizationRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- merchantKey is NOT NULL with no default, so existing rules need a value or
-- this migration fails on any database that has taught the app anything.
-- Seeded from the raw pattern (already unique, so the unique index holds);
-- normalizeExistingRules() rewrites these to real merchant keys on the next
-- start, because the normalizer can't be expressed in SQL.
INSERT INTO "new_CategorizationRule" ("categoryId", "confidence", "createdAt", "id", "pattern", "merchantKey", "timesUsed", "updatedAt") SELECT "categoryId", "confidence", "createdAt", "id", "pattern", "pattern", "timesUsed", "updatedAt" FROM "CategorizationRule";
DROP TABLE "CategorizationRule";
ALTER TABLE "new_CategorizationRule" RENAME TO "CategorizationRule";
CREATE UNIQUE INDEX "CategorizationRule_pattern_key" ON "CategorizationRule"("pattern");
CREATE UNIQUE INDEX "CategorizationRule_merchantKey_key" ON "CategorizationRule"("merchantKey");
CREATE INDEX "CategorizationRule_pattern_idx" ON "CategorizationRule"("pattern");
CREATE INDEX "CategorizationRule_merchantKey_idx" ON "CategorizationRule"("merchantKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
