import { prisma } from "../db";

interface TransferPair {
  fromTransaction: { id: string; name: string; amount: number; date: Date; accountName: string };
  toTransaction: { id: string; name: string; amount: number; date: Date; accountName: string };
  confidence: "high" | "medium" | "low";
  // Why it thinks so, so a suggestion can be judged rather than just trusted.
  reason: string;
}

const WINDOW_DAYS = 120;
const MAX_DAYS_APART = 4;
// Cents, to absorb float error on amounts read back from SQLite.
const AMOUNT_TOLERANCE = 0.01;

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 86_400_000;
}

function describeAccount(a: { institutionName: string; name: string }): string {
  return `${a.institutionName} - ${a.name}`;
}

// Candidates are every unpaired transaction in the window, whatever category
// they carry.
//
// This used to be restricted to uncategorized or "Transfer"-categorized rows,
// which meant auto-categorization actively broke transfer detection: a Zelle
// between your own accounts gets labelled "Zelle Sent" / "Zelle Received", and
// those labels excluded it from the matcher forever. The pair was never found,
// so both legs kept counting — inflating income by the amount and spending by
// the same amount, on every single transfer.
async function loadCandidates() {
  const since = new Date();
  since.setDate(since.getDate() - WINDOW_DAYS);

  return prisma.transaction.findMany({
    where: { date: { gte: since }, transferPairId: null },
    include: { account: { select: { id: true, name: true, institutionName: true, type: true } } },
    orderBy: { date: "desc" },
  });
}

type Candidate = Awaited<ReturnType<typeof loadCandidates>>[number];

function scorePair(out: Candidate, inn: Candidate): { confidence: "high" | "medium" | "low"; reason: string } {
  const days = daysBetween(out.date, inn.date);
  const sameDay = days < 1;

  const zelleBoth = /zelle/i.test(out.name) && /zelle/i.test(inn.name);
  const cardPayment =
    (out.account.type === "depository" && inn.account.type === "credit") ||
    /credit card|cc payment|autopay|payment thank you/i.test(out.name) ||
    /credit card|cc payment|autopay|payment thank you/i.test(inn.name);
  const transferWords =
    /transfer|deposit|withdrawal|payment|ach|wire/i.test(out.name) ||
    /transfer|deposit|withdrawal|payment|ach|wire/i.test(inn.name);

  if (zelleBoth) {
    return { confidence: "high", reason: "Zelle on both sides, same amount between two of your accounts" };
  }
  if (cardPayment) {
    return { confidence: "high", reason: "Looks like a credit card payment from a bank account" };
  }
  if (sameDay && transferWords) {
    return { confidence: "high", reason: "Same day, same amount, and both read like a transfer" };
  }
  if (sameDay) return { confidence: "medium", reason: "Same amount on the same day, across two accounts" };
  if (transferWords) {
    return { confidence: "medium", reason: `Same amount ${Math.round(days)} day(s) apart, worded like a transfer` };
  }
  return { confidence: "low", reason: `Same amount ${Math.round(days)} day(s) apart` };
}

const CONFIDENCE_ORDER = { high: 0, medium: 1, low: 2 } as const;

export async function detectPotentialTransfers(): Promise<TransferPair[]> {
  const candidates = await loadCandidates();

  // Bucketed by absolute amount so this doesn't compare every outflow against
  // every inflow. A transfer's two legs are equal and opposite, so the only
  // inflows worth looking at are the ones in the matching bucket.
  const inflowsByAmount = new Map<string, Candidate[]>();
  for (const t of candidates) {
    if (t.amount >= 0) continue;
    const key = Math.abs(t.amount).toFixed(2);
    const list = inflowsByAmount.get(key);
    list ? list.push(t) : inflowsByAmount.set(key, [t]);
  }

  const pairs: TransferPair[] = [];
  for (const out of candidates) {
    if (out.amount <= 0) continue;
    for (const inn of inflowsByAmount.get(out.amount.toFixed(2)) ?? []) {
      if (out.accountId === inn.accountId) continue; // same account isn't a transfer
      if (Math.abs(out.amount - Math.abs(inn.amount)) > AMOUNT_TOLERANCE) continue;
      if (daysBetween(out.date, inn.date) > MAX_DAYS_APART) continue;

      const { confidence, reason } = scorePair(out, inn);
      pairs.push({
        fromTransaction: {
          id: out.id,
          name: out.name,
          amount: out.amount,
          date: out.date,
          accountName: describeAccount(out.account),
        },
        toTransaction: {
          id: inn.id,
          name: inn.name,
          amount: Math.abs(inn.amount),
          date: inn.date,
          accountName: describeAccount(inn.account),
        },
        confidence,
        reason,
      });
    }
  }

  return pairs.sort((a, b) => {
    if (CONFIDENCE_ORDER[a.confidence] !== CONFIDENCE_ORDER[b.confidence]) {
      return CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence];
    }
    return b.fromTransaction.date.getTime() - a.fromTransaction.date.getTime();
  });
}

// Everything still unpaired, split by direction, for matching by hand when the
// detector can't be confident — amounts that differ by a fee, or legs more
// than a few days apart.
export async function getUnmatchedFlows() {
  const candidates = await loadCandidates();
  const shape = (t: Candidate) => ({
    id: t.id,
    name: t.name,
    amount: t.amount,
    date: t.date,
    accountId: t.accountId,
    accountName: describeAccount(t.account),
    kind: t.kind,
  });
  return {
    outgoing: candidates.filter((t) => t.amount > 0).map(shape),
    incoming: candidates.filter((t) => t.amount < 0).map(shape),
  };
}

// Pairs that are already linked, one row per pair rather than per leg, so a
// wrong match can be reviewed and undone.
export async function listLinkedPairs() {
  const legs = await prisma.transaction.findMany({
    where: { transferPairId: { not: null } },
    include: { account: { select: { name: true, institutionName: true } } },
    orderBy: { date: "desc" },
  });

  const byId = new Map(legs.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const pairs = [];

  for (const leg of legs) {
    if (seen.has(leg.id)) continue;
    const other = leg.transferPairId ? byId.get(leg.transferPairId) : undefined;
    // A leg whose counterpart is missing is a broken link, not a pair — show
    // it so it can be unlinked rather than hiding it from both views.
    seen.add(leg.id);
    if (other) seen.add(other.id);

    const out = leg.amount > 0 ? leg : other;
    const inn = leg.amount > 0 ? other : leg;

    pairs.push({
      outgoing: out
        ? {
            id: out.id,
            name: out.name,
            amount: out.amount,
            date: out.date,
            accountName: describeAccount(out.account),
          }
        : null,
      incoming: inn
        ? {
            id: inn.id,
            name: inn.name,
            amount: Math.abs(inn.amount),
            date: inn.date,
            accountName: describeAccount(inn.account),
          }
        : null,
      broken: !other,
    });
  }

  return pairs;
}

// Link two transactions as a transfer pair
export class TransferLinkError extends Error {}

export async function linkTransferPair(transaction1Id: string, transaction2Id: string) {
  // Matching by hand makes every one of these reachable from the UI. Without
  // the guards, linking a transaction that is already half of another pair
  // leaves its former counterpart pointing at a transaction that no longer
  // points back — a half-linked row that is excluded from spending but has
  // nothing to collapse against.
  if (transaction1Id === transaction2Id) {
    throw new TransferLinkError("A transaction can't be a transfer with itself.");
  }

  const [a, b] = await Promise.all([
    prisma.transaction.findUnique({ where: { id: transaction1Id } }),
    prisma.transaction.findUnique({ where: { id: transaction2Id } }),
  ]);
  if (!a || !b) throw new TransferLinkError("One of those transactions no longer exists.");

  if (a.accountId === b.accountId) {
    throw new TransferLinkError("Both sides are on the same account, so no money moved between accounts.");
  }
  if (a.amount > 0 === b.amount > 0) {
    throw new TransferLinkError("A transfer needs one outgoing and one incoming transaction.");
  }
  for (const t of [a, b]) {
    if (t.transferPairId && t.transferPairId !== (t.id === a.id ? b.id : a.id)) {
      throw new TransferLinkError("One of those is already matched to something else — unlink it first.");
    }
  }

  const transferCategory = await prisma.category.findFirst({ where: { isTransfer: true } });

  // Update both transactions to link to each other and set category to Transfer
  await prisma.transaction.update({
    where: { id: transaction1Id },
    data: {
      transferPairId: transaction2Id,
      categoryId: transferCategory?.id || null,
      kind: "transfer",
    },
  });

  await prisma.transaction.update({
    where: { id: transaction2Id },
    data: {
      transferPairId: transaction1Id,
      categoryId: transferCategory?.id || null,
      kind: "transfer",
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

  const counterpart = await prisma.transaction.findUnique({
    where: { id: transaction.transferPairId },
    select: { id: true, amount: true },
  });

  // Each leg reverts by its own direction. Forcing both to "expense" would turn
  // the inflow into a negative expense that silently cancels out the outflow,
  // leaving total spending unchanged after breaking the pair.
  const kindByDirection = (amount: number) => (amount < 0 ? "income" : "expense");

  await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      transferPairId: null,
      categoryId: null,
      kind: kindByDirection(transaction.amount),
    },
  });

  if (counterpart) {
    await prisma.transaction.update({
      where: { id: counterpart.id },
      data: {
        transferPairId: null,
        categoryId: null,
        kind: kindByDirection(counterpart.amount),
      },
    });
  }
}

// Auto-detect and link high-confidence transfers.
export async function autoLinkTransfers() {
  const potentialPairs = await detectPotentialTransfers();

  // A transaction can appear in several candidate pairs — three $500 moves in
  // one week all match each other. Linking them as they come would pair one
  // transaction twice and overwrite the first link, silently leaving a leg
  // pointing at a transaction that no longer points back. Best-scored pairs
  // win and each transaction is consumed once.
  const used = new Set<string>();
  let linked = 0;

  for (const pair of potentialPairs) {
    if (pair.confidence !== "high") continue;
    if (used.has(pair.fromTransaction.id) || used.has(pair.toTransaction.id)) continue;

    await linkTransferPair(pair.fromTransaction.id, pair.toTransaction.id);
    used.add(pair.fromTransaction.id);
    used.add(pair.toTransaction.id);
    linked++;
  }

  return { total: potentialPairs.length, linked };
}
