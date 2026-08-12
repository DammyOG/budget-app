import { Router } from "express";
import { prisma } from "../db";
import { autoCategorizeAll } from "../services/autoCategorize";
import { fixPaymentThankYou } from "../services/fixMiscategorized";
import { kindForCategory } from "../services/transactionKind";

const router = Router();

const VALID_KINDS = new Set(["expense", "income", "transfer"]);

router.get("/", async (req, res) => {
  const { accountId, categoryId, kind, search, startDate, endDate, minAmount, maxAmount, pendingOnly, limit, offset } =
    req.query;

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
  // a later page the client hasn't asked for yet.
  if (minAmount || maxAmount) {
    // Filtering is on magnitude ("at least $50"), not signed value, to match
    // how the UI presents amount range — SQLite has no native ABS() filter
    // via Prisma, so match both the positive and negative side of the range
    // explicitly instead. Leaving either bound unset (rather than defaulting
    // it to 0) would otherwise let it match every amount on the other side
    // of zero.
    const min = minAmount ? Number(minAmount) : 0;
    const max = maxAmount ? Number(maxAmount) : undefined;
    where.OR = [
      { amount: { gte: min, ...(max !== undefined ? { lte: max } : {}) } },
      { amount: { lte: -min, ...(max !== undefined ? { gte: -max } : {}) } },
    ];
  }
  if (pendingOnly === "true") where.pending = true;

  const take = limit ? Number(limit) : 100;
  const skip = offset ? Number(offset) : 0;

  // Fetched alongside the page rather than assumed, so the client can tell
  // "you've seen everything" apart from "there's 3,000 more rows past the
  // 500th" — silently capping at a fixed number with no total made older
  // transactions disappear from the list with no indication anything was cut.
  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { date: "desc" },
      take,
      skip,
      include: { account: { select: { name: true, institutionName: true } }, category: true },
    }),
    prisma.transaction.count({ where }),
  ]);

  res.json({ transactions, total, hasMore: skip + transactions.length < total });
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
