import { Router } from "express";
import { prisma } from "../db";
import { autoCategorizeAll } from "../services/autoCategorize";
import { fixPaymentThankYou } from "../services/fixMiscategorized";

const router = Router();

router.get("/", async (req, res) => {
  const { accountId, categoryId, search, startDate, endDate, limit } = req.query;

  const where: any = {};
  if (accountId) where.accountId = String(accountId);
  if (categoryId) where.categoryId = categoryId === "uncategorized" ? null : String(categoryId);
  if (search) where.name = { contains: String(search) };
  if (startDate || endDate) {
    where.date = {};
    if (startDate) where.date.gte = new Date(String(startDate));
    if (endDate) where.date.lte = new Date(String(endDate));
  }

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { date: "desc" },
    take: limit ? Number(limit) : 500,
    include: { account: { select: { name: true, institutionName: true } }, category: true },
  });
  res.json(transactions);
});

router.post("/manual", async (req, res) => {
  const { accountId, amount, date, name, categoryId, notes } = req.body;
  if (!accountId || amount == null || !date || !name) {
    return res.status(400).json({ error: "accountId, amount, date, and name are required" });
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
    },
  });
  res.json(transaction);
});

router.patch("/:id", async (req, res) => {
  const { categoryId, notes, name, amount, date } = req.body;

  // Get the transaction first to check if category is changing
  const oldTransaction = await prisma.transaction.findUnique({
    where: { id: req.params.id },
  });

  const transaction = await prisma.transaction.update({
    where: { id: req.params.id },
    data: {
      categoryId: categoryId === undefined ? undefined : categoryId || null,
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
