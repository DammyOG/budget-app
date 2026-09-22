import { prisma } from "../db";
import { syncAccountsForItem } from "./syncAccounts";
import { syncTransactionsForItem } from "./syncTransactions";

// Plaid requires periodic bank re-authentication; when a login expires, sync
// starts failing with this code. Without tracking it, the failure is silent —
// the dashboard just keeps showing whatever balance it last had, with nothing
// telling you it's stale.
const REAUTH_ERROR_CODES = new Set(["ITEM_LOGIN_REQUIRED", "ITEM_LOCKED", "ITEM_NOT_SUPPORTED"]);

export interface ItemSyncResult {
  accounts: number;
  transactions: { added: number; modified: number; removed: number } | null;
}

// Runs both halves of a sync for one linked bank and records the outcome on
// the PlaidItem, so lastSyncedAt / needsReauth are always accurate for
// whoever's asking (dashboard, accounts list) without them re-deriving it.
export async function syncItem(plaidItemDbId: string): Promise<ItemSyncResult> {
  // Captured before anything is written, so reconcile can bound its work to
  // the rows this sync creates.
  const syncStartedAt = new Date();
  try {
    const accounts = await syncAccountsForItem(plaidItemDbId);

    // Investment-only items (some Robinhood/IRA accounts) may not support
    // /transactions/sync at all — balances above still succeeded, so that's
    // not treated as a sync failure, just an absence of transaction data.
    let transactions: ItemSyncResult["transactions"] = null;
    try {
      transactions = await syncTransactionsForItem(plaidItemDbId);
    } catch (txErr: any) {
      console.warn("Transactions sync skipped for item", plaidItemDbId, txErr.response?.data || txErr.message);
    }

    // Categorize and pair what just arrived. Without this a sync left new
    // transactions uncategorized and transfers unmatched, so every transfer
    // between the user's own accounts counted as both income and spending
    // until they happened to press "Clean up" on the right page.
    //
    // Failure here doesn't fail the sync: the transactions are already
    // stored, and tidying can be retried.
    if (transactions) {
      try {
        const { reconcile } = await import("./reconcile");
        await reconcile(syncStartedAt);
      } catch (reconcileErr: any) {
        console.warn("Post-sync reconcile failed for item", plaidItemDbId, reconcileErr.message);
      }
    }

    await prisma.plaidItem.update({
      where: { id: plaidItemDbId },
      data: { lastSyncedAt: new Date(), needsReauth: false, lastSyncError: null },
    });

    return { accounts, transactions };
  } catch (err: any) {
    const errorCode = err.response?.data?.error_code as string | undefined;
    const message = err.response?.data?.error_message || err.message || "Sync failed";

    await prisma.plaidItem.update({
      where: { id: plaidItemDbId },
      data: {
        needsReauth: errorCode ? REAUTH_ERROR_CODES.has(errorCode) : false,
        lastSyncError: message,
      },
    });

    throw err;
  }
}
