import { prisma } from "../db";
import { plaidClient } from "../plaid";
import { decrypt } from "../crypto";

// Uses Plaid's cursor-based /transactions/sync so repeated calls only pull
// what's changed since last time, instead of re-fetching full history.
export async function syncTransactionsForItem(plaidItemDbId: string) {
  const item = await prisma.plaidItem.findUniqueOrThrow({ where: { id: plaidItemDbId } });
  const accessToken = decrypt(item.accessTokenEnc);

  let cursor = item.transactionsCursor ?? undefined;
  let added = 0;
  let modified = 0;
  let removed = 0;
  let hasMore = true;

  while (hasMore) {
    const { data } = await plaidClient.transactionsSync({
      access_token: accessToken,
      cursor,
    });

    for (const tx of data.added) {
      const account = await prisma.account.findUnique({ where: { plaidAccountId: tx.account_id } });
      if (!account) continue;
      await prisma.transaction.upsert({
        where: { plaidTransactionId: tx.transaction_id },
        create: {
          plaidTransactionId: tx.transaction_id,
          accountId: account.id,
          amount: tx.amount,
          date: new Date(tx.date),
          name: tx.name,
          merchantName: tx.merchant_name ?? null,
          pending: tx.pending,
        },
        update: {
          amount: tx.amount,
          date: new Date(tx.date),
          name: tx.name,
          merchantName: tx.merchant_name ?? null,
          pending: tx.pending,
        },
      });
      added++;
    }

    for (const tx of data.modified) {
      const existing = await prisma.transaction.findUnique({
        where: { plaidTransactionId: tx.transaction_id },
      });
      if (!existing) continue;
      await prisma.transaction.update({
        where: { id: existing.id },
        data: {
          amount: tx.amount,
          date: new Date(tx.date),
          name: tx.name,
          merchantName: tx.merchant_name ?? null,
          pending: tx.pending,
        },
      });
      modified++;
    }

    for (const tx of data.removed) {
      if (!tx.transaction_id) continue;
      await prisma.transaction
        .delete({ where: { plaidTransactionId: tx.transaction_id } })
        .catch(() => undefined);
      removed++;
    }

    cursor = data.next_cursor;
    hasMore = data.has_more;
  }

  await prisma.plaidItem.update({
    where: { id: item.id },
    data: { transactionsCursor: cursor },
  });

  return { added, modified, removed };
}
