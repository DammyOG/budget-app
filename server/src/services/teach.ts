import { prisma } from "../db";
import { merchantKey } from "./merchantKey";
import { predict, trainModel } from "./classifier";

// Reviewing uncategorized transactions one row at a time makes you answer the
// same merchant over and over — twelve Amazon charges are twelve questions
// with the same answer. Grouping by merchant and ordering by how much each
// answer resolves means a handful of questions covers most of the ledger.

export interface TeachItem {
  merchantKey: string;
  sampleName: string; // a real descriptor, so the merchant is recognizable
  count: number;
  totalAmount: number; // magnitude, for ranking and for showing what's at stake
  lastDate: Date;
  accountName: string;
  transactionIds: string[];
  guess: { categoryId: string; categoryName: string; confidence: number; reason: string } | null;
}

export async function getTeachQueue(limit = 10): Promise<{
  merchants: TeachItem[];
  uncategorizedTransactions: number;
  uncategorizedMerchants: number;
  coverage: number;
  modelTrainedOn: number;
}> {
  const [uncategorized, categorizable, model] = await Promise.all([
    prisma.transaction.findMany({
      where: { categoryId: null, kind: { not: "transfer" } },
      select: { id: true, name: true, amountCents: true, date: true, account: { select: { name: true } } },
      orderBy: { date: "desc" },
    }),
    prisma.transaction.count({ where: { kind: { not: "transfer" } } }),
    trainModel(),
  ]);

  const groups = new Map<string, TeachItem>();
  for (const tx of uncategorized) {
    const key = merchantKey(tx.name);
    if (!key) continue;

    let group = groups.get(key);
    if (!group) {
      group = {
        merchantKey: key,
        sampleName: tx.name,
        count: 0,
        totalAmount: 0,
        lastDate: tx.date,
        accountName: tx.account.name,
        transactionIds: [],
        guess: null,
      };
      groups.set(key, group);
    }
    group.count++;
    group.totalAmount += Math.abs(tx.amountCents);
    group.transactionIds.push(tx.id);
    if (tx.date > group.lastDate) group.lastDate = tx.date;
  }

  for (const group of groups.values()) {
    const guess = predict(model, group.sampleName);
    // Only offered below the auto-apply threshold; anything above it was
    // already applied and wouldn't be in this queue.
    if (guess) {
      group.guess = {
        categoryId: guess.categoryId,
        categoryName: guess.categoryName,
        confidence: guess.confidence,
        reason: guess.reason,
      };
    }
  }

  // Ranked by what answering actually buys you: many transactions and real
  // money first, so ten answers clear most of the backlog instead of ten
  // one-off coffees.
  const merchants = [...groups.values()].sort(
    (a, b) => b.count * Math.max(b.totalAmount, 1) - a.count * Math.max(a.totalAmount, 1)
  );

  return {
    merchants: merchants.slice(0, limit),
    uncategorizedTransactions: uncategorized.length,
    uncategorizedMerchants: groups.size,
    coverage: categorizable > 0 ? (categorizable - uncategorized.length) / categorizable : 1,
    modelTrainedOn: model.totalDocs,
  };
}
