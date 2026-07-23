import { prisma } from "../db";

interface TransferPair {
  fromTransaction: {
    id: string;
    name: string;
    amount: number;
    date: Date;
    accountName: string;
  };
  toTransaction: {
    id: string;
    name: string;
    amount: number;
    date: Date;
    accountName: string;
  };
  confidence: "high" | "medium" | "low";
}

// Detect potential inter-account transfers
export async function detectPotentialTransfers(): Promise<TransferPair[]> {
  // Get all uncategorized or Transfer-categorized transactions from the last 90 days
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const transferCategory = await prisma.category.findFirst({
    where: { name: "Transfer" },
  });

  const transactions = await prisma.transaction.findMany({
    where: {
      date: { gte: ninetyDaysAgo },
      transferPairId: null, // Not already paired
      OR: [{ categoryId: null }, { categoryId: transferCategory?.id }],
    },
    include: {
      account: { select: { id: true, name: true, institutionName: true, type: true } },
    },
    orderBy: { date: "desc" },
  });

  const potentialPairs: TransferPair[] = [];

  // Split into expenses (positive) and income (negative)
  const expenses = transactions.filter((t) => t.amount > 0);
  const income = transactions.filter((t) => t.amount < 0);

  for (const expense of expenses) {
    for (const incomeItem of income) {
      // Skip if same account
      if (expense.accountId === incomeItem.accountId) continue;

      // Check if amounts match (within $0.01 tolerance for floating point)
      const amountMatch = Math.abs(expense.amount - Math.abs(incomeItem.amount)) < 0.01;
      if (!amountMatch) continue;

      // Check if dates are close (within 3 days)
      const daysDiff = Math.abs((expense.date.getTime() - incomeItem.date.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff > 3) continue;

      // Determine confidence level
      let confidence: "high" | "medium" | "low" = "medium";

      // Check for transfer and credit card payment keywords
      const hasTransferKeywords =
        /transfer|deposit|withdrawal|payment|ach|wire/i.test(expense.name) ||
        /transfer|deposit|withdrawal|payment|ach|wire/i.test(incomeItem.name);

      const isCreditCardPayment =
        (expense.account.type === "depository" && incomeItem.account.type === "credit") ||
        /credit card|cc payment|autopay/i.test(expense.name) ||
        /credit card|cc payment|autopay/i.test(incomeItem.name);

      // Check if it's a Zelle transfer (both sides mention Zelle)
      const isZelleTransfer =
        /zelle/i.test(expense.name) && /zelle/i.test(incomeItem.name);

      // High confidence if:
      // - Zelle transfer between own accounts (both sides mention Zelle with matching amounts)
      // - Credit card payment (checking -> credit card)
      // - Same day AND contains transfer keywords
      if (isZelleTransfer) {
        confidence = "high";
      } else if (isCreditCardPayment) {
        confidence = "high";
      } else if (daysDiff === 0 && hasTransferKeywords) {
        confidence = "high";
      } else if (daysDiff === 0) {
        confidence = "medium";
      } else if (hasTransferKeywords) {
        confidence = "medium";
      } else {
        confidence = "low";
      }

      potentialPairs.push({
        fromTransaction: {
          id: expense.id,
          name: expense.name,
          amount: expense.amount,
          date: expense.date,
          accountName: `${expense.account.institutionName} - ${expense.account.name}`,
        },
        toTransaction: {
          id: incomeItem.id,
          name: incomeItem.name,
          amount: Math.abs(incomeItem.amount),
          date: incomeItem.date,
          accountName: `${incomeItem.account.institutionName} - ${incomeItem.account.name}`,
        },
        confidence,
      });
    }
  }

  // Sort by confidence and date
  return potentialPairs.sort((a, b) => {
    const confidenceOrder = { high: 0, medium: 1, low: 2 };
    if (confidenceOrder[a.confidence] !== confidenceOrder[b.confidence]) {
      return confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
    }
    return b.fromTransaction.date.getTime() - a.fromTransaction.date.getTime();
  });
}

// Link two transactions as a transfer pair
export async function linkTransferPair(transaction1Id: string, transaction2Id: string) {
  const transferCategory = await prisma.category.findFirst({
    where: { name: "Transfer" },
  });

  // Update both transactions to link to each other and set category to Transfer
  await prisma.transaction.update({
    where: { id: transaction1Id },
    data: {
      transferPairId: transaction2Id,
      categoryId: transferCategory?.id || null,
    },
  });

  await prisma.transaction.update({
    where: { id: transaction2Id },
    data: {
      transferPairId: transaction1Id,
      categoryId: transferCategory?.id || null,
    },
  });
}

// Unlink a transfer pair
export async function unlinkTransferPair(transactionId: string) {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
  });

  if (!transaction?.transferPairId) {
    return;
  }

  // Unlink both transactions
  await prisma.transaction.update({
    where: { id: transactionId },
    data: { transferPairId: null, categoryId: null },
  });

  await prisma.transaction.update({
    where: { id: transaction.transferPairId },
    data: { transferPairId: null, categoryId: null },
  });
}

// Auto-detect and link high-confidence transfers
export async function autoLinkTransfers() {
  const potentialPairs = await detectPotentialTransfers();
  const highConfidencePairs = potentialPairs.filter((p) => p.confidence === "high");

  let linked = 0;
  for (const pair of highConfidencePairs) {
    await linkTransferPair(pair.fromTransaction.id, pair.toTransaction.id);
    linked++;
  }

  return { total: potentialPairs.length, linked };
}
