-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "transferPairId" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_transferPairId_idx" ON "Transaction"("transferPairId");
