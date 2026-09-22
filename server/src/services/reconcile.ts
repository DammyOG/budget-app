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
export async function reconcile() {
  // Credit-card "payment thank you" rows first: they're transfers wearing a
  // description that reads like income.
  await fixPaymentThankYou();

  // Then categorize, which is also what trains and applies the model.
  const categorization = await autoCategorizeAll();

  // Pairing last. Detection looks at every unpaired transaction regardless of
  // category, so it sees the rows categorization just labelled — and linking
  // overrides that label with the transfer, which is the more specific fact.
  const transfers = await autoLinkTransfers();

  return { categorization, transfers };
}
