import { Router } from "express";
import { plaidClient, PLAID_PRODUCTS, PLAID_OPTIONAL_PRODUCTS, PLAID_COUNTRY_CODES } from "../plaid";
import { prisma } from "../db";
import { encrypt, decrypt } from "../crypto";
import { syncItem } from "../services/syncItem";

const router = Router();

// A single fixed local user — this app is single-user/self-hosted, so
// Plaid's "client_user_id" just needs to be any stable identifier.
const LOCAL_USER_ID = "local-user";

router.post("/create_link_token", async (req, res) => {
  try {
    const { data } = await plaidClient.linkTokenCreate({
      user: { client_user_id: LOCAL_USER_ID },
      client_name: "Budget App",
      products: PLAID_PRODUCTS,
      optional_products: PLAID_OPTIONAL_PRODUCTS.length ? PLAID_OPTIONAL_PRODUCTS : undefined,
      country_codes: PLAID_COUNTRY_CODES,
      language: "en",
      // Banks that use OAuth (BofA, Capital One, and most major US banks)
      // redirect the browser away to their own login page and then back —
      // Plaid requires a pre-registered redirect_uri to send it back to.
      redirect_uri: process.env.PLAID_REDIRECT_URI || undefined,
    });
    res.json({ linkToken: data.link_token });
  } catch (err: any) {
    console.error(err.response?.data || err);
    res.status(500).json({ error: err.response?.data?.error_message || "Failed to create link token" });
  }
});

// Plaid's "update mode": reconnecting an expired bank login through Link
// without creating a second, duplicate item. The existing access token is
// reused, so nothing needs exchanging on success — just re-sync.
router.post("/create_update_link_token/:itemId", async (req, res) => {
  try {
    const item = await prisma.plaidItem.findUniqueOrThrow({ where: { id: req.params.itemId } });
    const { data } = await plaidClient.linkTokenCreate({
      user: { client_user_id: LOCAL_USER_ID },
      client_name: "Budget App",
      access_token: decrypt(item.accessTokenEnc),
      country_codes: PLAID_COUNTRY_CODES,
      language: "en",
      redirect_uri: process.env.PLAID_REDIRECT_URI || undefined,
    });
    res.json({ linkToken: data.link_token });
  } catch (err: any) {
    console.error(err.response?.data || err);
    res.status(500).json({ error: err.response?.data?.error_message || "Failed to create reconnect link" });
  }
});

router.post("/exchange_public_token", async (req, res) => {
  const { publicToken } = req.body;
  if (!publicToken) return res.status(400).json({ error: "publicToken is required" });

  try {
    const exchange = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;

    const itemInfo = await plaidClient.itemGet({ access_token: accessToken });
    let institutionName: string | null = null;
    const institutionId = itemInfo.data.item.institution_id ?? null;
    if (institutionId) {
      const inst = await plaidClient.institutionsGetById({
        institution_id: institutionId,
        country_codes: PLAID_COUNTRY_CODES,
      });
      institutionName = inst.data.institution.name;
    }

    const item = await prisma.plaidItem.create({
      data: {
        itemId,
        accessTokenEnc: encrypt(accessToken),
        institutionId,
        institutionName,
      },
    });

    await syncItem(item.id);

    res.json({ success: true, institutionName });
  } catch (err: any) {
    console.error(err.response?.data || err);
    res.status(500).json({ error: err.response?.data?.error_message || "Failed to link account" });
  }
});

router.post("/sync/:itemId", async (req, res) => {
  try {
    const result = await syncItem(req.params.itemId);
    res.json(result);
  } catch (err: any) {
    console.error(err.response?.data || err);
    const needsReauth = err.response?.data?.error_code === "ITEM_LOGIN_REQUIRED";
    res.status(500).json({
      error: needsReauth
        ? "This bank login has expired and needs to be reconnected."
        : err.response?.data?.error_message || "Sync failed",
      needsReauth,
    });
  }
});

router.post("/sync_all", async (req, res) => {
  const items = await prisma.plaidItem.findMany();
  const results = [];
  for (const item of items) {
    try {
      const result = await syncItem(item.id);
      results.push({ itemId: item.id, institutionName: item.institutionName, ...result });
    } catch (err: any) {
      results.push({
        itemId: item.id,
        institutionName: item.institutionName,
        error: err.response?.data?.error_message || err.message || "Sync failed",
        needsReauth: err.response?.data?.error_code === "ITEM_LOGIN_REQUIRED",
      });
    }
  }
  res.json({ results });
});

export default router;
