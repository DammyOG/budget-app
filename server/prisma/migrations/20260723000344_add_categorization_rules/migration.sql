-- CreateTable
CREATE TABLE "CategorizationRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pattern" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 100,
    "timesUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CategorizationRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CategorizationRule_pattern_key" ON "CategorizationRule"("pattern");

-- CreateIndex
CREATE INDEX "CategorizationRule_pattern_idx" ON "CategorizationRule"("pattern");
