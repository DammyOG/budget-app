import { prisma } from "../db";
import { isOutflow, spendingAmount } from "../money";

export interface RecurringTransaction {
  name: string;
  merchantName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  frequency: "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
  averageAmount: number;
  count: number;
  lastDate: Date;
  nextExpectedDate: Date;
  transactions: {
    id: string;
    amountCents: number;
    date: Date;
    accountName: string;
  }[];
}

/**
 * Detects recurring transactions by finding patterns in transaction history
 * Groups by name and looks for regular intervals between transactions
 */
export async function detectRecurringTransactions(): Promise<RecurringTransaction[]> {
  // Get all transactions, grouped by name
  const transactions = await prisma.transaction.findMany({
    where: {
      // Exclude transfers and manual transactions. Keyed off the category
      // flag rather than the literal name "Transfer", so a category the user
      // marked as a transfer is excluded too.
      categoryId: { not: null },
      category: { isTransfer: false },
      isManual: false,
    },
    include: {
      account: { select: { name: true } },
      category: { select: { name: true } },
    },
    orderBy: { date: "asc" },
  });

  // Group transactions by normalized name (lowercase, trim)
  const grouped = new Map<string, typeof transactions>();
  for (const tx of transactions) {
    const key = tx.name.toLowerCase().trim();
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(tx);
  }

  const recurring: RecurringTransaction[] = [];

  // Analyze each group for recurring patterns
  for (const [name, txs] of grouped.entries()) {
    // Need at least 3 occurrences to be considered recurring
    if (txs.length < 3) continue;

    // Calculate intervals between transactions (in days)
    const intervals: number[] = [];
    for (let i = 1; i < txs.length; i++) {
      const days = Math.round(
        (new Date(txs[i].date).getTime() - new Date(txs[i - 1].date).getTime()) /
          (1000 * 60 * 60 * 24)
      );
      intervals.push(days);
    }

    // Calculate average interval and standard deviation
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance =
      intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) /
      intervals.length;
    const stdDev = Math.sqrt(variance);

    // If standard deviation is high, it's not truly recurring
    // Allow 20% variance for monthly (7 days), less for others
    const maxStdDev = avgInterval * 0.25;
    if (stdDev > maxStdDev) continue;

    // Determine frequency based on average interval
    let frequency: RecurringTransaction["frequency"];
    if (avgInterval >= 6 && avgInterval <= 8) {
      frequency = "weekly";
    } else if (avgInterval >= 13 && avgInterval <= 15) {
      frequency = "biweekly";
    } else if (avgInterval >= 28 && avgInterval <= 32) {
      frequency = "monthly";
    } else if (avgInterval >= 88 && avgInterval <= 95) {
      frequency = "quarterly";
    } else if (avgInterval >= 350 && avgInterval <= 380) {
      frequency = "yearly";
    } else {
      // Doesn't match common patterns
      continue;
    }

    // Rounded to a whole cent: an average of integers is fractional, and a
    // figure presented as money shouldn't carry a third of a cent.
    const amounts = txs.map((tx) => tx.amountCents);
    const avgAmount = Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length);

    // Calculate next expected date
    const lastDate = new Date(txs[txs.length - 1].date);
    const nextExpectedDate = new Date(lastDate);
    nextExpectedDate.setDate(nextExpectedDate.getDate() + Math.round(avgInterval));

    recurring.push({
      name: txs[0].name, // Use original casing
      merchantName: txs[0].merchantName,
      categoryId: txs[0].categoryId,
      categoryName: txs[0].category?.name || null,
      frequency,
      averageAmount: avgAmount,
      count: txs.length,
      lastDate,
      nextExpectedDate,
      transactions: txs.map((tx) => ({
        id: tx.id,
        amountCents: tx.amountCents,
        date: new Date(tx.date),
        accountName: tx.account.name,
      })),
    });
  }

  // Sort by next expected date (soonest first)
  recurring.sort((a, b) => a.nextExpectedDate.getTime() - b.nextExpectedDate.getTime());

  return recurring;
}

/**
 * Gets statistics about recurring transactions
 */
export async function getRecurringStats() {
  const recurring = await detectRecurringTransactions();

  const monthlyExpenses = recurring.filter((r) => isOutflow(r.averageAmount) && r.frequency === "monthly");
  const totalMonthlyExpenses = monthlyExpenses.reduce((sum, r) => sum + spendingAmount(r.averageAmount), 0);

  const allRecurringExpenses = recurring.filter((r) => isOutflow(r.averageAmount));
  const totalRecurringExpenses = allRecurringExpenses.reduce((sum, r) => {
    // Convert to monthly equivalent
    // Read as a positive cost, since it's presented as "you spend this much
    // per month" rather than as a signed ledger entry.
    const perOccurrence = spendingAmount(r.averageAmount);
    const monthlyEquivalent =
      r.frequency === "weekly"
        ? perOccurrence * 4.33
        : r.frequency === "biweekly"
        ? perOccurrence * 2.17
        : r.frequency === "monthly"
        ? perOccurrence
        : r.frequency === "quarterly"
        ? perOccurrence / 3
        : perOccurrence / 12; // yearly
    return sum + monthlyEquivalent;
  }, 0);

  return {
    total: recurring.length,
    monthlySubscriptions: monthlyExpenses.length,
    totalMonthlyExpenses,
    totalRecurringMonthlyEquivalent: totalRecurringExpenses,
  };
}
