import { prisma } from "../db";

// Special function to recategorize Zelle transfers that were incorrectly categorized
export async function fixZelleTransfers() {
  // Get all Zelle Sent and Zelle Received transactions
  const zelleSentCategory = await prisma.category.findFirst({ where: { name: "Zelle Sent" } });
  const zelleReceivedCategory = await prisma.category.findFirst({ where: { name: "Zelle Received" } });

  if (!zelleSentCategory && !zelleReceivedCategory) {
    return { fixed: 0 };
  }

  const zelleSent = await prisma.transaction.findMany({
    where: { categoryId: zelleSentCategory?.id },
    include: { account: true },
  });

  const zelleReceived = await prisma.transaction.findMany({
    where: { categoryId: zelleReceivedCategory?.id },
    include: { account: true },
  });

  let fixed = 0;

  // Find matching pairs (same amount, within 3 days, different accounts)
  for (const sent of zelleSent) {
    for (const received of zelleReceived) {
      // Skip if already paired
      if (sent.transferPairId || received.transferPairId) continue;

      // Skip if same account
      if (sent.accountId === received.accountId) continue;

      // Check if amounts match
      const amountMatch = Math.abs(sent.amount - Math.abs(received.amount)) < 0.01;
      if (!amountMatch) continue;

      // Check if dates are close (within 3 days)
      const daysDiff = Math.abs((sent.date.getTime() - received.date.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff > 3) continue;

      // Found a match! Link them as a transfer
      const transferCategory = await prisma.category.findFirst({ where: { name: "Transfer" } });

      await prisma.transaction.update({
        where: { id: sent.id },
        data: {
          transferPairId: received.id,
          categoryId: transferCategory?.id || null,
        },
      });

      await prisma.transaction.update({
        where: { id: received.id },
        data: {
          transferPairId: sent.id,
          categoryId: transferCategory?.id || null,
        },
      });

      fixed++;
      break; // Move to next sent transaction
    }
  }

  return { fixed };
}
