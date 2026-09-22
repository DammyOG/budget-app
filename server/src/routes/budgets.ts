import { Router } from "express";
import { prisma } from "../db";

const router = Router();

// month format: "YYYY-MM"; defaults to current month
router.get("/", async (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const budgets = await prisma.budget.findMany({
    where: { month },
    include: { category: true },
  });
  res.json(budgets);
});

router.put("/", async (req, res) => {
  const { categoryId, month, amountCents } = req.body;
  if (!categoryId || !month || amountCents == null) {
    return res.status(400).json({ error: "categoryId, month, and amountCents are required" });
  }
  const budget = await prisma.budget.upsert({
    where: { categoryId_month: { categoryId, month } },
    create: { categoryId, month, amountCents: Math.round(Number(amountCents)) },
    update: { amountCents: Math.round(Number(amountCents)) },
  });
  res.json(budget);
});

router.delete("/:id", async (req, res) => {
  await prisma.budget.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

export default router;
