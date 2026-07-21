import { Router } from "express";
import { prisma } from "../db";

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
  res.json(transaction);
});

router.delete("/:id", async (req, res) => {
  await prisma.transaction.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

export default router;
