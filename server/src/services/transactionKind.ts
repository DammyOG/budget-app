import { prisma } from "../db";

export type TransactionKind = "expense" | "income" | "transfer";

// The only category that always means "this is money moving between my own
// accounts". Zelle Sent/Received deliberately aren't here: unpaired, they're
// money to or from another person, which is real spending or real income.
// Paired ones are set to "transfer" explicitly when the pair is linked.
const TRANSFER_CATEGORIES = new Set(["Transfer"]);

// Kind follows from the category a transaction lands in, so callers that
// assign a category don't each have to remember to reason about it.
export async function kindForCategory(categoryId: string | null): Promise<TransactionKind> {
  if (!categoryId) return "expense";

  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { name: true, isIncome: true },
  });
  if (!category) return "expense";

  if (TRANSFER_CATEGORIES.has(category.name)) return "transfer";
  if (category.isIncome) return "income";
  return "expense";
}
