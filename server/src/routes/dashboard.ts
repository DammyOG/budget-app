import { Router } from "express";
import { prisma } from "../db";

const router = Router();

const LIABILITY_TYPES = new Set(["credit", "loan"]);

router.get("/summary", async (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const [year, mon] = month.split("-").map(Number);
  const startDate = new Date(Date.UTC(year, mon - 1, 1));
  const endDate = new Date(Date.UTC(year, mon, 1));

  const accounts = await prisma.account.findMany({ where: { archivedAt: null } });

  let assets = 0;
  let liabilities = 0;
  const byType: Record<string, number> = {};
  for (const acct of accounts) {
    const balance = acct.currentBalance ?? 0;
    if (LIABILITY_TYPES.has(acct.type)) {
      liabilities += balance;
    } else {
      assets += balance;
    }
    byType[acct.type] = (byType[acct.type] || 0) + balance;
  }

  const transactions = await prisma.transaction.findMany({
    where: { date: { gte: startDate, lt: endDate }, amount: { gt: 0 } },
    include: { category: true },
  });

  // Get Transfer category to exclude from calculations
  const transferCategory = await prisma.category.findFirst({ where: { name: "Transfer" } });

  const spendingByCategory: Record<string, { categoryId: string | null; name: string; total: number }> = {};
  for (const tx of transactions) {
    // Skip transfers (either by category or if it's a linked transfer pair)
    if (tx.categoryId === transferCategory?.id || tx.transferPairId) continue;

    const key = tx.categoryId || "uncategorized";
    const name = tx.category?.name || "Uncategorized";
    if (!spendingByCategory[key]) spendingByCategory[key] = { categoryId: tx.categoryId, name, total: 0 };
    spendingByCategory[key].total += tx.amount;
  }

  const budgets = await prisma.budget.findMany({ where: { month }, include: { category: true } });
  const budgetVsActual = budgets.map((b) => ({
    categoryId: b.categoryId,
    categoryName: b.category.name,
    budgeted: b.amount,
    spent: spendingByCategory[b.categoryId]?.total || 0,
  }));

  res.json({
    month,
    netWorth: assets - liabilities,
    assets,
    liabilities,
    byType,
    spendingByCategory: Object.values(spendingByCategory).sort((a, b) => b.total - a.total),
    budgetVsActual,
  });
});

// New endpoint for income & spending analysis with flexible date ranges
router.get("/income-spending", async (req, res) => {
  try {
    const { startDate: start, endDate: end, groupBy = "month" } = req.query;

    let startDate: Date;
    let endDate: Date;

    if (start && end) {
      startDate = new Date(start as string);
      endDate = new Date(end as string);
    } else {
      // Default to current month
      const now = new Date();
      startDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
      endDate = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1));
    }

    const transactions = await prisma.transaction.findMany({
      where: { date: { gte: startDate, lt: endDate } },
      include: { category: true },
      orderBy: { date: "asc" },
    });

    // Get Transfer category to exclude from calculations
    const transferCategory = await prisma.category.findFirst({ where: { name: "Transfer" } });

    // Separate income and expenses (Plaid convention: negative = income, positive = expense)
    // Exclude transfers from both income and expenses:
    // - Either has Transfer category OR has a transferPairId (linked as inter-account transfer)
    const income = transactions.filter(
      (t) => t.amount < 0 && t.categoryId !== transferCategory?.id && !t.transferPairId
    );
    const expenses = transactions.filter(
      (t) => t.amount > 0 && t.categoryId !== transferCategory?.id && !t.transferPairId
    );

    const totalIncome = income.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const totalExpenses = expenses.reduce((sum, t) => sum + t.amount, 0);

    // Income by category
    const incomeByCategory: Record<string, { categoryId: string | null; name: string; total: number }> = {};
    for (const tx of income) {
      const key = tx.categoryId || "uncategorized";
      const name = tx.category?.name || "Uncategorized";
      if (!incomeByCategory[key]) incomeByCategory[key] = { categoryId: tx.categoryId, name, total: 0 };
      incomeByCategory[key].total += Math.abs(tx.amount);
    }

    // Expenses by category
    const expensesByCategory: Record<string, { categoryId: string | null; name: string; total: number }> = {};
    for (const tx of expenses) {
      const key = tx.categoryId || "uncategorized";
      const name = tx.category?.name || "Uncategorized";
      if (!expensesByCategory[key]) expensesByCategory[key] = { categoryId: tx.categoryId, name, total: 0 };
      expensesByCategory[key].total += tx.amount;
    }

    // Month-by-month breakdown (if groupBy is month)
    const byMonth: Record<string, { month: string; income: number; expenses: number; net: number }> = {};
    if (groupBy === "month") {
      // Exclude transfers from monthly breakdown
      const nonTransferTransactions = transactions.filter(
        (tx) => tx.categoryId !== transferCategory?.id && !tx.transferPairId
      );
      for (const tx of nonTransferTransactions) {
        const monthKey = tx.date.toISOString().slice(0, 7);
        if (!byMonth[monthKey]) {
          byMonth[monthKey] = { month: monthKey, income: 0, expenses: 0, net: 0 };
        }
        if (tx.amount < 0) {
          byMonth[monthKey].income += Math.abs(tx.amount);
        } else {
          byMonth[monthKey].expenses += tx.amount;
        }
        byMonth[monthKey].net = byMonth[monthKey].income - byMonth[monthKey].expenses;
      }
    }

    res.json({
      startDate,
      endDate,
      totalIncome,
      totalExpenses,
      netIncome: totalIncome - totalExpenses,
      incomeByCategory: Object.values(incomeByCategory).sort((a, b) => b.total - a.total),
      expensesByCategory: Object.values(expensesByCategory).sort((a, b) => b.total - a.total),
      byMonth: Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)),
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch income/spending data" });
  }
});

export default router;
