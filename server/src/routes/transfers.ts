import { Router } from "express";
import {
  detectPotentialTransfers,
  linkTransferPair,
  unlinkTransferPair,
  autoLinkTransfers,
  TransferLinkError,
} from "../services/detectTransfers";

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

// Everything still unpaired, split by direction, for matching by hand. The
// detector only proposes pairs whose amounts match to the cent and whose dates
// are within a few days; a transfer that lost a wire fee, or arrived a week
// later, never appears there and has to be matchable manually or it keeps
// counting as both income and spending forever.
router.get("/unmatched", async (req, res) => {
  const { getUnmatchedFlows } = await import("../services/detectTransfers");
  res.json(await getUnmatchedFlows());
});

// Pairs already linked, so a wrong match can be found and undone.
router.get("/linked", async (req, res) => {
  const { listLinkedPairs } = await import("../services/detectTransfers");
  res.json(await listLinkedPairs());
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
    // A rejected match is the user picking two rows that can't be a pair, not
    // a server fault — it should say why rather than "something went wrong".
    if (err instanceof TransferLinkError) return res.status(400).json({ error: err.message });
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

// Auto-link high-confidence transfers.
//
// This used to run a separate Zelle-specific pass first, which re-implemented
// pairing with its own thresholds and its own copy of the linking logic. Now
// that detection considers every unpaired transaction rather than only the
// uncategorized ones, the general detector matches Zelle pairs at high
// confidence on its own, and the second implementation was only another place
// for the two to disagree.
router.post("/auto-link", async (req, res) => {
  res.json(await autoLinkTransfers());
});

export default router;
