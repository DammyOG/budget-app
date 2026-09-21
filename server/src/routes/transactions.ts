import { Router } from "express";
import { prisma } from "../db";
import { autoCategorizeAll } from "../services/autoCategorize";
import { fixPaymentThankYou } from "../services/fixMiscategorized";
import { kindForCategory } from "../services/transactionKind";
import {
  findDuplicateGroups,
  findDuplicateKeys,
  duplicateGroupFilter,
  keyOf,
  isDuplicate,
} from "../services/duplicates";

const router = Router();

const VALID_KINDS = new Set(["expense", "income", "transfer"]);
const VALID_SORTS = new Set(["date", "amount", "name"]);

// Every ordering ends in a unique key. Without one, offset pagination over
// tied rows can repeat or drop transactions between pages: ties have no
// defined order, and SQLite is free to return them differently per query.
// Dates are stored at UTC midnight, so *every* same-day row is a tie.
function buildOrderBy(sort: string, dir: "asc" | "desc") {
  switch (sort) {
    case "amount":
      // By magnitude, so a $3,000 paycheck and $3,000 rent sort together as
      // "big" rather than landing at opposite ends of the list.
      return [{ absAmount: dir }, { date: "desc" as const }, { id: "asc" as const }];
    case "name":
      return [{ name: dir }, { date: "desc" as const }, { id: "asc" as const }];
    case "date":
    default:
      // Biggest first within a day: otherwise a $2,000 rent payment and a $4
      // coffee on the same date come back in arbitrary insertion order.
      return [{ date: dir }, { absAmount: "desc" as const }, { id: "asc" as const }];
  }
}

router.get("/", async (req, res) => {
  const {
    accountId,
    categoryId,
    kind,
    search,
    startDate,
    endDate,
    minAmount,
    maxAmount,
    pendingOnly,
    duplicatesOnly,
    collapseTransfers,
    sort,
    dir,
    limit,
    offset,
  } = req.query;

  const where: any = {};
  if (accountId) where.accountId = String(accountId);
  if (categoryId) where.categoryId = categoryId === "uncategorized" ? null : String(categoryId);
  if (kind) where.kind = String(kind);
  if (search) where.name = { contains: String(search) };
  if (startDate || endDate) {
    where.date = {};
    if (startDate) where.date.gte = new Date(String(startDate));
    if (endDate) where.date.lte = new Date(String(endDate));
  }
  // Applied server-side, not just to whatever page happens to be loaded —
  // filtering only the fetched rows would silently miss matches sitting on
  // a later page the client hasn't asked for yet. Range is on magnitude
  // ("at least $50"), which absAmount now expresses directly.
  if (minAmount || maxAmount) {
    where.absAmount = {};
    if (minAmount) where.absAmount.gte = Number(minAmount);
    if (maxAmount) where.absAmount.lte = Number(maxAmount);
  }
  if (pendingOnly === "true") where.pending = true;

  // A matched transfer is one movement of money recorded twice, once on each
  // account; showing both legs makes the ledger read as though it happened
  // twice. Hide the inflow leg and annotate the surviving outflow with where
  // the money went.
  //
  // Not applied when filtering to one account: there the hidden leg may be
  // the only row that account has for the movement, and its ledger would look
  // like money vanished.
  const collapsing = collapseTransfers !== "false" && !accountId;
  if (collapsing) {
    where.NOT = { AND: [{ transferPairId: { not: null } }, { amount: { lt: 0 } }] };
  }

  const sortField = VALID_SORTS.has(String(sort)) ? String(sort) : "date";
  const sortDir = dir === "asc" ? "asc" : "desc";

  const take = limit ? Number(limit) : 100;
  const skip = offset ? Number(offset) : 0;

  // Duplicate groups are computed over the whole filtered set, not the current
  // page, so a charge whose twin sits three pages later is still flagged.
  const duplicateGroups = await findDuplicateGroups(where);
  const duplicateKeys = new Set(duplicateGroups.map(keyOf));

  // Narrowed in the query rather than by filtering the page, so `total` and
  // `hasMore` describe what the user is actually looking at.
  if (duplicatesOnly === "true") {
    if (duplicateGroups.length === 0) {
      return res.json({ transactions: [], total: 0, hasMore: false, collapsed: collapsing });
    }
    where.OR = duplicateGroupFilter(duplicateGroups);
  }

  // Fetched alongside the page rather than assumed, so the client can tell
  // "you've seen everything" apart from "there's 3,000 more rows past the
  // 500th" — silently capping at a fixed number with no total made older
  // transactions disappear from the list with no indication anything was cut.
  const [rows, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: buildOrderBy(sortField, sortDir),
      take,
      skip,
      include: { account: { select: { name: true, institutionName: true } }, category: true },
    }),
    prisma.transaction.count({ where }),
  ]);

  // The hidden half of each collapsed pair, so the visible row can say where
  // the money actually went instead of just "Transfer".
  const pairIds = rows.map((t) => t.transferPairId).filter((id): id is string => !!id);
  const counterparts = pairIds.length
    ? await prisma.transaction.findMany({
        where: { id: { in: pairIds } },
        select: { id: true, amount: true, account: { select: { name: true, institutionName: true } } },
      })
    : [];
  const counterpartById = new Map(counterparts.map((c) => [c.id, c]));

  const transactions = rows.map((tx) => {
    const counterpart = tx.transferPairId ? counterpartById.get(tx.transferPairId) : undefined;
    return {
      ...tx,
      isDuplicate: isDuplicate(tx, duplicateKeys),
      transferCounterpartAccount: counterpart?.account.name ?? null,
    };
  });

  res.json({
    transactions,
    total,
    hasMore: skip + rows.length < total,
    collapsed: collapsing,
  });
});

router.post("/manual", async (req, res) => {
  const { accountId, amount, date, name, categoryId, notes, kind } = req.body;
  if (!accountId || amount == null || !date || !name) {
    return res.status(400).json({ error: "accountId, amount, date, and name are required" });
  }
  if (kind && !VALID_KINDS.has(kind)) {
    return res.status(400).json({ error: `kind must be one of: ${[...VALID_KINDS].join(", ")}` });
  }
  const transaction = await prisma.transaction.create({
    data: {
      accountId,
      amount: Number(amount),
      date: new Date(date),
      name,
      categoryId: categoryId || null,
      notes: notes || null,
      isManual: true,
      // Defaults to expense regardless of sign — a negative manual amount is
      // far more often a refund than income, and inferring "income" from the
      // sign silently inflates the income figure.
      kind: kind || (await kindForCategory(categoryId || null)),
      kindLocked: !!kind,
    },
  });
  res.json(transaction);
});

router.patch("/:id", async (req, res) => {
  const { categoryId, notes, name, amount, date, kind } = req.body;

  if (kind !== undefined && !VALID_KINDS.has(kind)) {
    return res.status(400).json({ error: `kind must be one of: ${[...VALID_KINDS].join(", ")}` });
  }

  // Get the transaction first to check if category is changing
  const oldTransaction = await prisma.transaction.findUnique({
    where: { id: req.params.id },
  });

  // Reclassifying away from transfer has to break the pair, or the counterpart
  // stays linked to a transaction that's no longer a transfer.
  if (kind !== undefined && kind !== "transfer" && oldTransaction?.transferPairId) {
    const { unlinkTransferPair } = await import("../services/detectTransfers");
    await unlinkTransferPair(req.params.id);
  }

  // Changing the category implies a kind (income category -> income, and so
  // on), unless the caller set kind explicitly in the same request.
  const derivedKind =
    kind === undefined && categoryId !== undefined && !oldTransaction?.kindLocked
      ? await kindForCategory(categoryId || null)
      : undefined;

  const transaction = await prisma.transaction.update({
    where: { id: req.params.id },
    data: {
      categoryId: categoryId === undefined ? undefined : categoryId || null,
      kind: kind === undefined ? derivedKind : kind,
      // Only an explicit kind change locks it; inheriting kind from a category
      // shouldn't freeze it against future re-categorization.
      kindLocked: kind === undefined ? undefined : true,
      notes: notes === undefined ? undefined : notes,
      name: name === undefined ? undefined : name,
      amount: amount === undefined ? undefined : Number(amount),
      date: date === undefined ? undefined : new Date(date),
    },
  });

  // If user manually categorized this transaction, learn from it
  if (categoryId !== undefined && categoryId && oldTransaction?.categoryId !== categoryId) {
    const { learnFromUserCategorization } = await import("../services/categorizationLearning");
    await learnFromUserCategorization(transaction.name, categoryId).catch(console.error);
  }

  res.json(transaction);
});

router.delete("/:id", async (req, res) => {
  await prisma.transaction.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// What needs a human's attention, as counts rather than a ranked feed.
// Mixing these into the main list's sort order would mean the list silently
// reshuffles as you categorize things; a banner with counts and jump-links
// keeps the ledger stable while still surfacing what's outstanding.
router.get("/attention", async (req, res) => {
  const [pending, uncategorized, duplicateKeys] = await Promise.all([
    prisma.transaction.count({ where: { pending: true } }),
    // Transfers deliberately excluded: they don't carry a category, so
    // counting them as "uncategorized" would be a to-do that can't be done.
    prisma.transaction.count({ where: { categoryId: null, kind: { not: "transfer" } } }),
    findDuplicateKeys({}),
  ]);

  // A group of duplicates is one thing to look at, however many rows it spans.
  res.json({
    pending,
    uncategorized,
    duplicateGroups: duplicateKeys.size,
    total: pending + uncategorized + duplicateKeys.size,
  });
});

router.post("/auto-categorize", async (req, res) => {
  try {
    // First, fix any miscategorized "payment thank you" type transactions
    await fixPaymentThankYou();

    // Then auto-categorize uncategorized transactions
    const result = await autoCategorizeAll();
    res.json(result);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Failed to auto-categorize transactions" });
  }
});

// Get categorization suggestions
router.get("/suggestions", async (req, res) => {
  try {
    const { getCategorizationSuggestions } = await import("../services/categorizationLearning");
    const suggestions = await getCategorizationSuggestions();
    res.json(suggestions);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Failed to get suggestions" });
  }
});

// Get similar transactions for a given transaction name
router.get("/similar/:name", async (req, res) => {
  try {
    const { getSimilarTransactions } = await import("../services/categorizationLearning");
    const similar = await getSimilarTransactions(decodeURIComponent(req.params.name), "");
    res.json(similar);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Failed to get similar transactions" });
  }
});

// Categorize all similar transactions
router.post("/categorize-similar", async (req, res) => {
  try {
    const { transactionName, categoryId } = req.body;
    if (!transactionName || !categoryId) {
      return res.status(400).json({ error: "transactionName and categoryId are required" });
    }
    const { categorizeAllSimilar } = await import("../services/categorizationLearning");
    const result = await categorizeAllSimilar(transactionName, categoryId);
    res.json(result);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Failed to categorize similar transactions" });
  }
});

export default router;
