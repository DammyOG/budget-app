import { Router } from "express";
import { prisma } from "../db";
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
      return [{ absAmountCents: dir }, { date: "desc" as const }, { id: "asc" as const }];
    case "name":
      return [{ name: dir }, { date: "desc" as const }, { id: "asc" as const }];
    case "date":
    default:
      // Biggest first within a day: otherwise a $2,000 rent payment and a $4
      // coffee on the same date come back in arbitrary insertion order.
      return [{ date: dir }, { absAmountCents: "desc" as const }, { id: "asc" as const }];
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
  // ("at least $50"), which absAmountCents now expresses directly.
  if (minAmount || maxAmount) {
    where.absAmountCents = {};
    if (minAmount) where.absAmountCents.gte = Number(minAmount);
    if (maxAmount) where.absAmountCents.lte = Number(maxAmount);
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
    // Hide the receiving leg and keep the sending one. Now stated directly —
    // "is the incoming side of a transfer" — instead of inferred from a sign
    // test plus a non-null pair id.
    where.transferAsIncoming = { is: null };
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
      include: {
        account: { select: { name: true, institutionName: true } },
        category: true,
        transferAsOutgoing: { include: { incoming: { include: { account: { select: { name: true } } } } } },
        transferAsIncoming: { include: { outgoing: { include: { account: { select: { name: true } } } } } },
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  // The other half of each collapsed pair, so the visible row can say where
  // the money actually went instead of just "Transfer".
  const transactions = rows.map(({ transferAsOutgoing, transferAsIncoming, ...tx }) => {
    const counterpart = transferAsOutgoing?.incoming ?? transferAsIncoming?.outgoing ?? null;
    return {
      ...tx,
      isDuplicate: isDuplicate(tx, duplicateKeys),
      // Kept in the response because the client uses it to tell a matched
      // transfer from an unmatched one.
      transferPairId: counterpart?.id ?? null,
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
  // The API speaks cents, and the field name says so. A request carrying
  // dollars in a field called amountCents would be off by a factor of 100
  // with nothing to catch it, which is exactly what naming the unit prevents.
  const { accountId, amountCents, date, name, categoryId, notes, kind } = req.body;
  if (!accountId || amountCents == null || !date || !name) {
    return res.status(400).json({ error: "accountId, amountCents, date, and name are required" });
  }
  if (kind && !VALID_KINDS.has(kind)) {
    return res.status(400).json({ error: `kind must be one of: ${[...VALID_KINDS].join(", ")}` });
  }
  const transaction = await prisma.transaction.create({
    data: {
      accountId,
      amountCents: Math.round(Number(amountCents)),
      date: new Date(date),
      name,
      categoryId: categoryId || null,
      notes: notes || null,
      isManual: true,
      // Defaults to expense regardless of sign — a positive manual amount is
      // far more often a refund than income, and inferring "income" from the
      // sign silently inflates the income figure.
      kind: kind || (await kindForCategory(categoryId || null)),
      kindLocked: !!kind,
    },
  });
  res.json(transaction);
});

router.patch("/:id", async (req, res) => {
  const { categoryId, notes, name, amountCents, date, kind } = req.body;

  if (kind !== undefined && !VALID_KINDS.has(kind)) {
    return res.status(400).json({ error: `kind must be one of: ${[...VALID_KINDS].join(", ")}` });
  }

  // Get the transaction first to check if category is changing
  const oldTransaction = await prisma.transaction.findUnique({
    where: { id: req.params.id },
  });

  // Reclassifying away from transfer has to break the pair, or the counterpart
  // stays linked to a transaction that's no longer a transfer.
  const wasTransferLeg =
    oldTransaction &&
    (await prisma.transfer.count({
      where: { OR: [{ outgoingId: oldTransaction.id }, { incomingId: oldTransaction.id }] },
    })) > 0;
  if (kind !== undefined && kind !== "transfer" && wasTransferLeg) {
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
      amountCents: amountCents === undefined ? undefined : Math.round(Number(amountCents)),
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
  // Unmatch first if this is half of a transfer. Deleting it outright cascades
  // the transfer away but leaves the other leg still marked kind="transfer"
  // with the transfer category — excluded from spending forever, with nothing
  // left to explain why.
  const { unlinkTransferPair } = await import("../services/detectTransfers");
  await unlinkTransferPair(req.params.id);
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

// Categorize and pair in one pass. Pairing is included because leaving it to
// a separate button on another page meant transfers between the user's own
// accounts kept counting as both income and spending until they found it.
router.post("/auto-categorize", async (req, res) => {
  const { reconcile } = await import("../services/reconcile");
  const { categorization, transfers } = await reconcile();
  res.json({ ...categorization, transfersLinked: transfers.linked, transferCandidates: transfers.total });
});

// The merchants worth asking about, most impactful first, each with the
// model's own guess. Answering one of these applies to every matching
// transaction rather than just the row in front of you.
router.get("/teach", async (req, res) => {
  const { getTeachQueue } = await import("../services/teach");
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  res.json(await getTeachQueue(Math.min(Math.max(limit, 1), 50)));
});

// Answer one merchant: records the rule and back-fills the ledger.
router.post("/teach", async (req, res) => {
  const { transactionName, categoryId } = req.body;
  if (!transactionName || !categoryId) {
    return res.status(400).json({ error: "transactionName and categoryId are required" });
  }
  const { learnFromUserCategorization } = await import("../services/categorizationLearning");
  const { applied } = await learnFromUserCategorization(transactionName, categoryId);
  res.json({ applied });
});

// Get similar transactions for a given transaction name
router.get("/similar/:name", async (req, res) => {
  const { getSimilarTransactions } = await import("../services/categorizationLearning");
  res.json(await getSimilarTransactions(decodeURIComponent(req.params.name)));
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
