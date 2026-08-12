import { Router } from "express";
import { prisma } from "../db";
import { plaidClient } from "../plaid";
import { decrypt } from "../crypto";

const router = Router();

router.get("/", async (req, res) => {
  const accounts = await prisma.account.findMany({
    where: { archivedAt: null },
    orderBy: [{ institutionName: "asc" }, { name: "asc" }],
    include: {
      plaidItem: { select: { institutionName: true, lastSyncedAt: true, needsReauth: true, lastSyncError: true } },
    },
  });
  res.json(accounts);
});

router.get("/archived", async (req, res) => {
  const accounts = await prisma.account.findMany({
    where: { archivedAt: { not: null } },
    orderBy: { archivedAt: "desc" },
  });
  res.json(accounts);
});

// Manual accounts exist for anything you don't want to (or can't) link via
// Plaid — enter a balance by hand and update it yourself over time.
router.post("/manual", async (req, res) => {
  const { name, institutionName, type, subtype, currentBalance } = req.body;
  if (!name || !institutionName || !type) {
    return res.status(400).json({ error: "name, institutionName, and type are required" });
  }
  const account = await prisma.account.create({
    data: {
      name,
      institutionName,
      type,
      subtype: subtype ?? null,
      currentBalance: currentBalance != null ? Number(currentBalance) : null,
      isManual: true,
    },
  });
  res.json(account);
});

router.patch("/:id", async (req, res) => {
  const { name, currentBalance } = req.body;
  const account = await prisma.account.findUnique({ where: { id: req.params.id } });
  if (!account) return res.status(404).json({ error: "Not found" });
  if (!account.isManual) {
    return res.status(400).json({ error: "Only manual accounts can be edited directly; linked accounts sync automatically" });
  }
  const updated = await prisma.account.update({
    where: { id: req.params.id },
    data: {
      name: name ?? undefined,
      currentBalance: currentBalance != null ? Number(currentBalance) : undefined,
    },
  });
  res.json(updated);
});

router.delete("/:id", async (req, res) => {
  const account = await prisma.account.findUnique({ where: { id: req.params.id } });
  if (!account) return res.status(404).json({ error: "Not found" });
  if (account.archivedAt) return res.status(400).json({ error: "Already removed" });

  const plaidItemId = account.plaidItemId;

  // Archived rather than deleted: transaction history is a real financial
  // record, not disposable — one misclick shouldn't be able to erase months
  // of it. The account and its transactions stay in the database, just
  // hidden from the normal account list.
  await prisma.account.update({
    where: { id: req.params.id },
    data: { archivedAt: new Date() },
  });

  if (plaidItemId) {
    const remainingActive = await prisma.account.count({
      where: { plaidItemId, archivedAt: null },
    });
    if (remainingActive === 0) {
      const item = await prisma.plaidItem.findUnique({ where: { id: plaidItemId } });
      if (item) {
        await plaidClient
          .itemRemove({ access_token: decrypt(item.accessTokenEnc) })
          .catch((err) => console.warn("itemRemove failed", err.response?.data || err.message));
        // onDelete: SetNull on Account.plaidItem — this revokes the bank
        // connection without touching the now-archived account rows or the
        // transaction history attached to them.
        await prisma.plaidItem.delete({ where: { id: plaidItemId } });
      }
    }
  }

  res.json({ success: true });
});

router.post("/:id/restore", async (req, res) => {
  const account = await prisma.account.findUnique({ where: { id: req.params.id } });
  if (!account) return res.status(404).json({ error: "Not found" });
  if (!account.archivedAt) return res.status(400).json({ error: "Not archived" });

  const restored = await prisma.account.update({
    where: { id: req.params.id },
    data: { archivedAt: null },
  });
  res.json(restored);
});

// Permanent delete, only ever offered on an already-archived account —
// a second, deliberate step past the reversible one above.
router.delete("/:id/permanent", async (req, res) => {
  const account = await prisma.account.findUnique({ where: { id: req.params.id } });
  if (!account) return res.status(404).json({ error: "Not found" });
  if (!account.archivedAt) {
    return res.status(400).json({ error: "Archive the account first before permanently deleting it" });
  }
  await prisma.account.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

export default router;
