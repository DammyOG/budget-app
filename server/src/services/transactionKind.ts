import { prisma } from "../db";

export type TransactionKind = "expense" | "income" | "transfer";

// Kind follows from the category a transaction lands in, so callers that
// assign a category don't each have to remember to reason about it.
//
// isTransfer is a property of the category rather than a hardcoded list of
// names. Zelle Sent/Received are deliberately NOT transfer categories:
// unpaired, a Zelle is money to or from another person, which is real
// spending or real income. A Zelle between your own accounts becomes a
// transfer when its two legs are matched, which sets kind on both directly.
export async function kindForCategory(categoryId: string | null): Promise<TransactionKind> {
  if (!categoryId) return "expense";

  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { isIncome: true, isTransfer: true },
  });
  if (!category) return "expense";

  if (category.isTransfer) return "transfer";
  if (category.isIncome) return "income";
  return "expense";
}
