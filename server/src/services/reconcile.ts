import { prisma } from "../db";
import { fixPaymentThankYou } from "./fixMiscategorized";
import { autoCategorizeAll } from "./autoCategorize";
import { autoLinkTransfers } from "./detectTransfers";

// The whole tidy-up, in one place and in a fixed order, so a sync leaves the
// ledger in the same state as pressing "Clean up" by hand.
//
// Previously nothing ran after a Plaid sync: transactions arrived
// uncategorized and unpaired, and stayed that way until the user remembered
// to press a button on a particular page. Until they did, every transfer
// between their own accounts counted twice — once as income on the receiving
// side and once as spending on the sending side.
//
// `since` bounds the categorization pass to rows that arrived after that
// moment, so a sync's cost tracks what it pulled in rather than how much
// history has accumulated. Pairing is already bounded to a rolling window, and
// a new transaction's counterpart may be an older one, so that pass is not
// narrowed further.
export async function reconcile(since?: Date) {
  // Repair any leg left marked as a transfer with no transfer to belong to.
  // A transaction deleted outside the normal path takes its transfer row with
  // it, and the survivor would otherwise sit excluded from spending forever.
  //
  // Each reverts by its own direction. Forcing them all to "expense" would
  // turn an orphaned inflow into a negative expense that cancels out real
  // spending, leaving the total unchanged and the problem invisible.
  const orphanWhere = {
    kind: "transfer",
    transferAsOutgoing: { is: null },
    transferAsIncoming: { is: null },
  } as const;
  const [revertedOut, revertedIn] = await prisma.$transaction([
    prisma.transaction.updateMany({
      where: { ...orphanWhere, amountCents: { lt: 0 } },
      data: { kind: "expense", categoryId: null },
    }),
    prisma.transaction.updateMany({
      where: { ...orphanWhere, amountCents: { gt: 0 } },
      data: { kind: "income", categoryId: null },
    }),
  ]);
  const orphaned = revertedOut.count + revertedIn.count;
  if (orphaned > 0) {
    console.log(`Reverted ${orphaned} transaction(s) left marked as transfers with no counterpart`);
  }

  // Credit-card "payment thank you" rows first: they're transfers wearing a
  // description that reads like income.
  await fixPaymentThankYou();

  // Then categorize, which is also what trains and applies the model.
  const categorization = await autoCategorizeAll(since);

  // Pairing last. Detection looks at every unpaired transaction regardless of
  // category, so it sees the rows categorization just labelled — and linking
  // overrides that label with the transfer, which is the more specific fact.
  const transfers = await autoLinkTransfers();

  return { categorization, transfers };
}
