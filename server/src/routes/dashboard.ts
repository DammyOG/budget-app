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

  const spendingByCategory: Record<string, { categoryId: string | null; name: string; total: number }> = {};
  for (const tx of transactions) {
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

export default router;
