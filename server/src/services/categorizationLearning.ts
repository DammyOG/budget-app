import { prisma } from "../db";

// Learn from user feedback - when user manually categorizes a transaction
export async function learnFromUserCategorization(transactionName: string, categoryId: string) {
  // Check if a rule already exists for this exact transaction name
  const existingRule = await prisma.categorizationRule.findUnique({
    where: { pattern: transactionName },
  });

  if (existingRule) {
    // If it's the same category, increase confidence
    if (existingRule.categoryId === categoryId) {
      await prisma.categorizationRule.update({
        where: { id: existingRule.id },
        data: {
          confidence: Math.min(100, existingRule.confidence + 10),
          timesUsed: existingRule.timesUsed + 1,
        },
      });
    } else {
      // User changed category, update the rule
      await prisma.categorizationRule.update({
        where: { id: existingRule.id },
        data: {
          categoryId,
          confidence: 80, // Reset confidence to 80 when changed
          timesUsed: existingRule.timesUsed + 1,
        },
      });
    }
  } else {
    // Create new rule
    await prisma.categorizationRule.create({
      data: {
        pattern: transactionName,
        categoryId,
        confidence: 100,
        timesUsed: 1,
      },
    });
  }
}

// Get categorization suggestions for uncategorized transactions
export async function getCategorizationSuggestions() {
  const uncategorized = await prisma.transaction.findMany({
    where: { categoryId: null },
    include: { account: true },
    orderBy: { date: "desc" },
    take: 50, // Get most recent 50 uncategorized
  });

  const suggestions: Array<{
    transactionId: string;
    transactionName: string;
    amount: number;
    date: Date;
    suggestedCategory: { id: string; name: string } | null;
    confidence: number;
  }> = [];

  for (const tx of uncategorized) {
    // Check if we have a learned rule for this transaction name
    const rule = await prisma.categorizationRule.findFirst({
      where: { pattern: tx.name },
      include: { category: true },
    });

    if (rule && rule.confidence >= 60) {
      suggestions.push({
        transactionId: tx.id,
        transactionName: tx.name,
        amount: tx.amount,
        date: tx.date,
        suggestedCategory: {
          id: rule.category.id,
          name: rule.category.name,
        },
        confidence: rule.confidence,
      });
    } else {
      // No learned rule, add with null suggestion
      suggestions.push({
        transactionId: tx.id,
        transactionName: tx.name,
        amount: tx.amount,
        date: tx.date,
        suggestedCategory: null,
        confidence: 0,
      });
    }
  }

  return suggestions;
}

// Accept a categorization suggestion
export async function acceptSuggestion(transactionId: string, categoryId: string, transactionName: string) {
  // Update the transaction
  await prisma.transaction.update({
    where: { id: transactionId },
    data: { categoryId },
  });

  // Learn from this acceptance
  await learnFromUserCategorization(transactionName, categoryId);

  return { success: true };
}

// Reject a suggestion and optionally provide correct category
export async function rejectSuggestion(
  transactionId: string,
  suggestedCategoryId: string,
  correctCategoryId: string | null,
  transactionName: string
) {
  // Decrease confidence in the wrong suggestion
  const rule = await prisma.categorizationRule.findFirst({
    where: { pattern: transactionName, categoryId: suggestedCategoryId },
  });

  if (rule) {
    await prisma.categorizationRule.update({
      where: { id: rule.id },
      data: { confidence: Math.max(0, rule.confidence - 20) },
    });
  }

  // If user provided correct category, learn from it
  if (correctCategoryId) {
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { categoryId: correctCategoryId },
    });
    await learnFromUserCategorization(transactionName, correctCategoryId);
  }

  return { success: true };
}

// Apply similar transactions - when user categorizes one, offer to categorize similar ones
export async function getSimilarTransactions(transactionName: string, categoryId: string) {
  // Find transactions with the same name that are uncategorized
  const similar = await prisma.transaction.findMany({
    where: {
      name: transactionName,
      categoryId: null,
    },
    include: { account: true },
  });

  return similar;
}

// Apply category to all similar transactions
export async function categorizeAllSimilar(transactionName: string, categoryId: string) {
  // Update all uncategorized transactions with the same name
  const result = await prisma.transaction.updateMany({
    where: {
      name: transactionName,
      categoryId: null,
    },
    data: { categoryId },
  });

  // Learn from this
  await learnFromUserCategorization(transactionName, categoryId);

  return { count: result.count };
}
