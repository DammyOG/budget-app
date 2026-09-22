import { prisma } from "../db";
import { merchantKey } from "./merchantKey";
import { kindForCategory } from "./transactionKind";

// Rules are keyed by normalized merchant, not by the raw descriptor. Keying by
// the raw string meant a rule matched exactly one transaction — the one it was
// learned from — because every charge carries its own order id. One answer now
// covers every charge from that merchant, past and future.

// Teaching the app about a merchant also applies it to matching transactions
// that are already in the ledger, so an answer pays off immediately rather
// than only affecting whatever syncs next.
export async function learnFromUserCategorization(
  transactionName: string,
  categoryId: string
): Promise<{ applied: number }> {
  const key = merchantKey(transactionName);
  if (!key) return { applied: 0 };

  const existing = await prisma.categorizationRule.findUnique({ where: { merchantKey: key } });

  if (existing) {
    await prisma.categorizationRule.update({
      where: { id: existing.id },
      data:
        existing.categoryId === categoryId
          ? { confidence: Math.min(100, existing.confidence + 10), timesUsed: existing.timesUsed + 1 }
          : // Corrected to a different category: trust the correction, but not
            // as much as a fresh answer, since this merchant has now been
            // answered two different ways.
            { categoryId, confidence: 80, timesUsed: existing.timesUsed + 1 },
    });
  } else {
    await prisma.categorizationRule.create({
      data: { pattern: transactionName, merchantKey: key, categoryId, confidence: 100, timesUsed: 1 },
    });
  }

  const applied = await applyRuleToLedger(key, categoryId);
  return { applied };
}

// Categorize every uncategorized transaction whose merchant matches. Scanning
// in JS rather than SQL because the key is computed, not stored — the ledger
// for one person is small enough that this is not worth denormalizing.
export async function applyRuleToLedger(key: string, categoryId: string): Promise<number> {
  const candidates = await prisma.transaction.findMany({
    where: { categoryId: null, kind: { not: "transfer" } },
    select: { id: true, name: true, kindLocked: true },
  });

  const matching = candidates.filter((t) => merchantKey(t.name) === key);
  if (matching.length === 0) return 0;

  const kind = await kindForCategory(categoryId);
  const lockedIds = matching.filter((t) => t.kindLocked).map((t) => t.id);
  const unlockedIds = matching.filter((t) => !t.kindLocked).map((t) => t.id);

  // An explicitly set kind is the user's decision and outranks whatever the
  // category implies, so those rows get the category without the kind.
  if (lockedIds.length) {
    await prisma.transaction.updateMany({ where: { id: { in: lockedIds } }, data: { categoryId } });
  }
  if (unlockedIds.length) {
    await prisma.transaction.updateMany({ where: { id: { in: unlockedIds } }, data: { categoryId, kind } });
  }

  return matching.length;
}

// Rules written before rules were keyed by merchant hold a raw descriptor in
// merchantKey (the migration seeds it from pattern). Rewriting them here
// rather than in SQL because normalization is code, not a query.
export async function normalizeExistingRules(): Promise<number> {
  const rules = await prisma.categorizationRule.findMany({
    orderBy: [{ timesUsed: "desc" }, { confidence: "desc" }],
  });

  const seen = new Map<string, string>(); // normalized key -> winning rule id
  let rewritten = 0;

  for (const rule of rules) {
    const key = merchantKey(rule.pattern);
    if (!key || key === rule.merchantKey) {
      seen.set(rule.merchantKey, rule.id);
      continue;
    }

    // Two raw patterns can normalize to the same merchant. The list is ordered
    // by how much the rule has been used, so the first one wins and the
    // duplicate is dropped rather than colliding on the unique index.
    if (seen.has(key)) {
      await prisma.categorizationRule.delete({ where: { id: rule.id } });
      continue;
    }

    await prisma.categorizationRule.update({ where: { id: rule.id }, data: { merchantKey: key } });
    seen.set(key, rule.id);
    rewritten++;
  }

  return rewritten;
}

export async function findRuleFor(transactionName: string) {
  const key = merchantKey(transactionName);
  if (!key) return null;
  return prisma.categorizationRule.findUnique({ where: { merchantKey: key }, include: { category: true } });
}

// Same merchant, not the same descriptor — "SQ *BLUE BOTTLE 8871" and
// "SQ *BLUE BOTTLE 2290" are the same shop.
export async function getSimilarTransactions(transactionName: string) {
  const key = merchantKey(transactionName);
  const candidates = await prisma.transaction.findMany({
    where: { categoryId: null },
    include: { account: true },
  });
  return candidates.filter((t) => merchantKey(t.name) === key);
}

export async function categorizeAllSimilar(transactionName: string, categoryId: string) {
  const { applied } = await learnFromUserCategorization(transactionName, categoryId);
  return { count: applied };
}
