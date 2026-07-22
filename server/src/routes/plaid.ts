import { Router } from "express";
import { plaidClient, PLAID_PRODUCTS, PLAID_OPTIONAL_PRODUCTS, PLAID_COUNTRY_CODES } from "../plaid";
import { prisma } from "../db";
import { encrypt } from "../crypto";
import { syncAccountsForItem } from "../services/syncAccounts";
import { syncTransactionsForItem } from "../services/syncTransactions";

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
    });
    res.json({ linkToken: data.link_token });
  } catch (err: any) {
    console.error(err.response?.data || err);
    res.status(500).json({ error: err.response?.data?.error_message || "Failed to create link token" });
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

    await syncAccountsForItem(item.id);
    await syncTransactionsForItem(item.id).catch((err) => {
      // Investment-only items (e.g. some Robinhood/IRA accounts) may not
      // support /transactions/sync — balances still linked fine above.
      console.warn("Transactions sync skipped for item", item.id, err.response?.data || err.message);
    });

    res.json({ success: true, institutionName });
  } catch (err: any) {
    console.error(err.response?.data || err);
    res.status(500).json({ error: err.response?.data?.error_message || "Failed to link account" });
  }
});

router.post("/sync/:itemId", async (req, res) => {
  try {
    const accounts = await syncAccountsForItem(req.params.itemId);
    const txResult = await syncTransactionsForItem(req.params.itemId).catch(() => null);
    res.json({ accounts, transactions: txResult });
  } catch (err: any) {
    console.error(err.response?.data || err);
    res.status(500).json({ error: "Sync failed" });
  }
});

router.post("/sync_all", async (req, res) => {
  const items = await prisma.plaidItem.findMany();
  const results = [];
  for (const item of items) {
    try {
      const accounts = await syncAccountsForItem(item.id);
      const txResult = await syncTransactionsForItem(item.id).catch(() => null);
      results.push({ itemId: item.id, institutionName: item.institutionName, accounts, transactions: txResult });
    } catch (err: any) {
      results.push({ itemId: item.id, institutionName: item.institutionName, error: true });
    }
  }
  res.json({ results });
});

export default router;
