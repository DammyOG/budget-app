import { Router } from "express";
import { detectPotentialTransfers, linkTransferPair, unlinkTransferPair, autoLinkTransfers } from "../services/detectTransfers";
import { fixZelleTransfers } from "../services/fixZelleTransfers";

const router = Router();

// Get potential transfer pairs
router.get("/detect", async (req, res) => {
  try {
    const pairs = await detectPotentialTransfers();
    res.json(pairs);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Failed to detect transfers" });
  }
});

// Link two transactions as a transfer pair
router.post("/link", async (req, res) => {
  try {
    const { transaction1Id, transaction2Id } = req.body;
    if (!transaction1Id || !transaction2Id) {
      return res.status(400).json({ error: "Both transaction IDs are required" });
    }
    await linkTransferPair(transaction1Id, transaction2Id);
    res.json({ success: true });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Failed to link transfer pair" });
  }
});

// Unlink a transfer pair
router.post("/unlink", async (req, res) => {
  try {
    const { transactionId } = req.body;
    if (!transactionId) {
      return res.status(400).json({ error: "Transaction ID is required" });
    }
    await unlinkTransferPair(transactionId);
    res.json({ success: true });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Failed to unlink transfer pair" });
  }
});

// Auto-link high-confidence transfers
router.post("/auto-link", async (req, res) => {
  try {
    // First, fix Zelle transfers that are incorrectly categorized
    const zelleResult = await fixZelleTransfers();

    // Then, auto-link other high-confidence transfers
    const result = await autoLinkTransfers();

    res.json({
      ...result,
      zelleFixed: zelleResult.fixed,
      total: result.total + zelleResult.fixed,
      linked: result.linked + zelleResult.fixed
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Failed to auto-link transfers" });
  }
});

export default router;
