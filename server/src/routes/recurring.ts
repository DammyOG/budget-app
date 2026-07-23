import { Router } from "express";
import { detectRecurringTransactions, getRecurringStats } from "../services/recurringDetector";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const recurring = await detectRecurringTransactions();
    res.json(recurring);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Failed to detect recurring transactions" });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const stats = await getRecurringStats();
    res.json(stats);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Failed to get recurring stats" });
  }
});

export default router;
