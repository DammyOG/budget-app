import { prisma } from "../db";
import { isInflow, isOutflow } from "../money";

interface TransferPair {
  fromTransaction: { id: string; name: string; amountCents: number; date: Date; accountName: string };
  toTransaction: { id: string; name: string; amountCents: number; date: Date; accountName: string };
  confidence: "high" | "medium" | "low";
  // Why it thinks so, so a suggestion can be judged rather than just trusted.
  reason: string;
}

const WINDOW_DAYS = 120;
const MAX_DAYS_APART = 4;

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
    where: { date: { gte: since }, transferAsOutgoing: { is: null }, transferAsIncoming: { is: null } },
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
    if (!isInflow(t.amountCents)) continue;
    const key = String(Math.abs(t.amountCents));
    const list = inflowsByAmount.get(key);
    list ? list.push(t) : inflowsByAmount.set(key, [t]);
  }

  const pairs: TransferPair[] = [];
  for (const out of candidates) {
    if (!isOutflow(out.amountCents)) continue;
    for (const inn of inflowsByAmount.get(String(Math.abs(out.amountCents))) ?? []) {
      if (out.accountId === inn.accountId) continue; // same account isn't a transfer
      // Exact equality, now that amounts are integer cents. This carried a
      // one-cent tolerance purely to absorb float error — two legs of the same
      // transfer are the same number of cents, and the tolerance was quietly
      // also matching genuinely different amounts a cent apart.
      if (Math.abs(out.amountCents) !== Math.abs(inn.amountCents)) continue;
      if (daysBetween(out.date, inn.date) > MAX_DAYS_APART) continue;

      const { confidence, reason } = scorePair(out, inn);
      pairs.push({
        fromTransaction: {
          id: out.id,
          name: out.name,
          amountCents: out.amountCents,
          date: out.date,
          accountName: describeAccount(out.account),
        },
        toTransaction: {
          id: inn.id,
          name: inn.name,
          amountCents: Math.abs(inn.amountCents),
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
    amountCents: t.amountCents,
    date: t.date,
    accountId: t.accountId,
    accountName: describeAccount(t.account),
    kind: t.kind,
  });
  return {
    outgoing: candidates.filter((t) => isOutflow(t.amountCents)).map(shape),
    incoming: candidates.filter((t) => isInflow(t.amountCents)).map(shape),
  };
}

// Every matched transfer, so a wrong one can be found and undone. One row
// per transfer now, rather than assembled from two rows that point at each
// other and might not agree.
export async function listLinkedPairs() {
  const transfers = await prisma.transfer.findMany({
    include: {
      outgoing: { include: { account: { select: { name: true, institutionName: true } } } },
      incoming: { include: { account: { select: { name: true, institutionName: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return transfers.map((t) => ({
    id: t.id,
    outgoing: {
      id: t.outgoing.id,
      name: t.outgoing.name,
      amountCents: t.outgoing.amountCents,
      date: t.outgoing.date,
      accountName: describeAccount(t.outgoing.account),
    },
    incoming: {
      id: t.incoming.id,
      name: t.incoming.name,
      amountCents: Math.abs(t.incoming.amountCents),
      date: t.incoming.date,
      accountName: describeAccount(t.incoming.account),
    },
  }));
}

export class TransferLinkError extends Error {}

// Creating the transfer and marking both legs happens in one transaction, so
// a failure partway can't leave a pair recorded with only one leg relabelled.
export async function linkTransferPair(transaction1Id: string, transaction2Id: string) {
  if (transaction1Id === transaction2Id) {
    throw new TransferLinkError("A transaction can't be a transfer with itself.");
  }

  const [a, b] = await Promise.all([
    prisma.transaction.findUnique({
      where: { id: transaction1Id },
      include: { transferAsOutgoing: true, transferAsIncoming: true },
    }),
    prisma.transaction.findUnique({
      where: { id: transaction2Id },
      include: { transferAsOutgoing: true, transferAsIncoming: true },
    }),
  ]);
  if (!a || !b) throw new TransferLinkError("One of those transactions no longer exists.");

  if (a.accountId === b.accountId) {
    throw new TransferLinkError("Both sides are on the same account, so no money moved between accounts.");
  }
  if (isOutflow(a.amountCents) === isOutflow(b.amountCents)) {
    throw new TransferLinkError("A transfer needs one outgoing and one incoming transaction.");
  }
  for (const t of [a, b]) {
    const existing = t.transferAsOutgoing ?? t.transferAsIncoming;
    // Already this exact pair: re-linking is a no-op rather than an error, so
    // re-running the auto-matcher doesn't fail on work it already did.
    if (existing && existing.outgoingId !== a.id && existing.outgoingId !== b.id) {
      throw new TransferLinkError("One of those is already matched to something else — unlink it first.");
    }
    if (existing && (existing.incomingId !== a.id && existing.incomingId !== b.id)) {
      throw new TransferLinkError("One of those is already matched to something else — unlink it first.");
    }
  }

  const outgoing = isOutflow(a.amountCents) ? a : b;
  const incoming = isOutflow(a.amountCents) ? b : a;
  if (outgoing.transferAsOutgoing && incoming.transferAsIncoming) return; // already this pair

  const transferCategory = await prisma.category.findFirst({ where: { isTransfer: true } });

  await prisma.$transaction([
    prisma.transfer.create({ data: { outgoingId: outgoing.id, incomingId: incoming.id } }),
    prisma.transaction.updateMany({
      where: { id: { in: [outgoing.id, incoming.id] } },
      data: { categoryId: transferCategory?.id || null, kind: "transfer" },
    }),
  ]);
}

// Undo a match from either side. Deleting the transfer row dissolves the pair
// outright — there's no second pointer that could be missed.
export async function unlinkTransferPair(transactionId: string) {
  const transfer = await prisma.transfer.findFirst({
    where: { OR: [{ outgoingId: transactionId }, { incomingId: transactionId }] },
    include: { outgoing: true, incoming: true },
  });
  if (!transfer) return;

  // Each leg reverts by its own direction. Forcing both to "expense" would turn
  // the inflow into a negative expense that silently cancels out the outflow,
  // leaving total spending unchanged after breaking the pair.
  await prisma.$transaction([
    prisma.transfer.delete({ where: { id: transfer.id } }),
    prisma.transaction.update({
      where: { id: transfer.outgoing.id },
      data: { categoryId: null, kind: "expense" },
    }),
    prisma.transaction.update({
      where: { id: transfer.incoming.id },
      data: { categoryId: null, kind: "income" },
    }),
  ]);
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
