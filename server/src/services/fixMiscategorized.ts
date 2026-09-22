import { prisma } from "../db";

// Generic descriptors that say money moved but not what it was for. A credit
// card's "PAYMENT THANK YOU" is the receiving half of a card payment, but the
// same wording appears on genuine payments to other people, so guessing a
// category here is how a transfer ends up counted as income.
//
// These are text patterns because bank descriptors are text; that part can't
// be made data. What used to be magic strings was the *category* side —
// comparing category.name against "Zelle Sent", "Zelle Received" and
// "Transfer" to decide what to leave alone.
const AMBIGUOUS_DESCRIPTORS = ["payment thank you", "payment sent", "payment received"];

// A descriptor naming the rail isn't ambiguous: "ZELLE PAYMENT RECEIVED FROM
// JOHN" contains "payment received" but says exactly what it is, and clearing
// its category would send real person-to-person income back to the review
// queue on every sync. The old code got this right by skipping the Zelle
// categories; keying off the descriptor is the same protection without
// depending on which category the guess happened to land in.
const NAMED_RAILS = /zelle|venmo|cash app|cashapp|paypal|apple cash/i;

export async function fixPaymentThankYou() {
  const transactions = await prisma.transaction.findMany({
    where: { OR: AMBIGUOUS_DESCRIPTORS.map((d) => ({ name: { contains: d } })) },
    include: { category: true },
  });

  let fixed = 0;

  for (const tx of transactions) {
    // Already unlabelled, so there's nothing to undo.
    if (!tx.categoryId) continue;

    // The descriptor says which rail it came over, so it isn't ambiguous.
    if (NAMED_RAILS.test(tx.name)) continue;

    // Settled by a pairing: the match is a stronger statement about what this
    // is than any guess from the descriptor, and clearing it would undo work
    // the user already did.
    if (tx.transferPairId) continue;

    // Marked as a transfer by its category, which is the correct answer for a
    // card payment — leave it be rather than clearing and re-guessing.
    if (tx.category?.isTransfer) continue;

    // Anything else is a guess made from an ambiguous descriptor. Clearing it
    // puts the transaction in front of the user on the review screen instead
    // of leaving a wrong category sitting in their totals.
    await prisma.transaction.update({ where: { id: tx.id }, data: { categoryId: null } });
    fixed++;
  }

  return { fixed, total: transactions.length };
}
