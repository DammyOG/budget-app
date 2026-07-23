import { prisma } from "../db";

// Fix transactions that were incorrectly categorized
export async function fixPaymentThankYou() {
  // Find all transactions with "payment thank you" or similar generic messages
  const transactions = await prisma.transaction.findMany({
    where: {
      OR: [
        { name: { contains: "payment thank you" } },
        { name: { contains: "payment sent" } },
        { name: { contains: "payment received" } },
      ],
    },
    include: { category: true },
  });

  let fixed = 0;

  for (const tx of transactions) {
    // Skip if already uncategorized or if it's already a Zelle category (which is correct)
    if (!tx.categoryId || tx.category?.name === "Zelle Sent" || tx.category?.name === "Zelle Received") {
      continue;
    }

    // Skip if it's already correctly categorized as Transfer
    if (tx.category?.name === "Transfer") {
      continue;
    }

    // Uncategorize this transaction so user can manually categorize it
    await prisma.transaction.update({
      where: { id: tx.id },
      data: { categoryId: null },
    });

    fixed++;
  }

  return { fixed, total: transactions.length };
}
