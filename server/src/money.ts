// The sign convention, in one place.
//
//   amount < 0  money left the account  (spending, a transfer out)
//   amount > 0  money arrived           (income, a refund, a transfer in)
//
// This matches what the app displays — a $50 coffee reads -$50.00 — so there
// is no flip between what is stored and what is shown.
//
// Plaid uses the opposite convention: it reports money leaving an account as
// positive. That is inverted once, at ingest, in syncTransactions. Everywhere
// else in the codebase the rule above holds, which is the point: the old
// arrangement stored Plaid's convention and flipped it for display, so roughly
// half the money bugs so far came from code that was written in whichever
// convention its author had in mind at the time. A refund was read as income,
// and unlinking a transfer produced an inflow that silently cancelled the
// outflow it was meant to restore.
//
// These helpers exist so the rule is named at each use rather than re-derived
// from a bare `> 0`.

export function isOutflow(amount: number): boolean {
  return amount < 0;
}

export function isInflow(amount: number): boolean {
  return amount > 0;
}

// Spending as a positive figure, for totals that read "you spent $310".
export function spendingAmount(amount: number): number {
  return -amount;
}

// Income as a positive figure.
export function incomeAmount(amount: number): number {
  return amount;
}

// Plaid's sign, inverted to this codebase's convention. Called exactly once,
// where transactions enter the system.
export function fromPlaidAmount(plaidAmount: number): number {
  return -plaidAmount;
}
