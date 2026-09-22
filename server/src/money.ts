// The money conventions, in one place: unit and sign.
//
// UNIT — every stored money value is an integer number of cents. Floats can't
// represent 0.1 exactly, so sums drifted and exact comparisons needed
// tolerances (transfer matching carried a `< 0.01` guard purely to work around
// it). Field names end in "Cents" because an Int on its own can't say whether
// it holds dollars or cents, and TypeScript can't tell the two apart.
//
// SIGN —
//   amountCents < 0  money left the account  (spending, a transfer out)
//   amountCents > 0  money arrived           (income, a refund, a transfer in)
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

// Plaid's amount, converted to this codebase's unit and sign in one step:
// dollars to cents, and money-out from positive to negative. Called where
// transactions and balances enter the system, and nowhere else.
export function fromPlaidAmount(plaidDollars: number): number {
  return -Math.round(plaidDollars * 100);
}

// --- unit conversion, only at the edges ---

// Plaid reports dollars as a float. Rounding at the boundary is what keeps
// every later calculation exact.
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}
