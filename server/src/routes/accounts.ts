import { Router } from "express";
import { prisma } from "../db";
import { plaidClient } from "../plaid";
import { decrypt } from "../crypto";

const router = Router();

router.get("/", async (req, res) => {
  const accounts = await prisma.account.findMany({
    where: { archivedAt: null },
    orderBy: [{ institutionName: "asc" }, { name: "asc" }],
    include: { plaidItem: { select: { institutionName: true } } },
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

  const plaidItemId = account.plaidItemId;
  await prisma.account.delete({ where: { id: req.params.id } });

  if (plaidItemId) {
    const remaining = await prisma.account.count({ where: { plaidItemId } });
    if (remaining === 0) {
      const item = await prisma.plaidItem.findUnique({ where: { id: plaidItemId } });
      if (item) {
        await plaidClient
          .itemRemove({ access_token: decrypt(item.accessTokenEnc) })
          .catch((err) => console.warn("itemRemove failed", err.response?.data || err.message));
        await prisma.plaidItem.delete({ where: { id: plaidItemId } });
      }
    }
  }

  res.json({ success: true });
});

export default router;
