import { Router } from "express";
import { prisma } from "../db";

const router = Router();

router.get("/", async (req, res) => {
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  res.json(categories);
});

router.post("/", async (req, res) => {
  const { name, icon, isIncome } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  const category = await prisma.category.create({
    data: { name, icon: icon || null, isIncome: !!isIncome },
  });
  res.json(category);
});

router.delete("/:id", async (req, res) => {
  await prisma.category.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

export default router;
