import { prisma } from "../db";
import { plaidClient } from "../plaid";
import { decrypt } from "../crypto";

// Pulls current balances for every account under a Plaid item and upserts
// them into our Account table. Called right after linking and on manual sync.
export async function syncAccountsForItem(plaidItemDbId: string) {
  const item = await prisma.plaidItem.findUniqueOrThrow({ where: { id: plaidItemDbId } });
  const accessToken = decrypt(item.accessTokenEnc);

  const { data } = await plaidClient.accountsBalanceGet({ access_token: accessToken });

  for (const acct of data.accounts) {
    await prisma.account.upsert({
      where: { plaidAccountId: acct.account_id },
      create: {
        plaidItemId: item.id,
        plaidAccountId: acct.account_id,
        name: acct.name,
        officialName: acct.official_name ?? null,
        institutionName: item.institutionName ?? "Unknown institution",
        type: acct.type,
        subtype: acct.subtype ?? null,
        mask: acct.mask ?? null,
        currentBalance: acct.balances.current ?? null,
        availableBalance: acct.balances.available ?? null,
        isoCurrencyCode: acct.balances.iso_currency_code ?? "USD",
      },
      update: {
        name: acct.name,
        officialName: acct.official_name ?? null,
        currentBalance: acct.balances.current ?? null,
        availableBalance: acct.balances.available ?? null,
      },
    });
  }

  return data.accounts.length;
}
