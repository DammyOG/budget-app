// Verifies that transfers between your own accounts never inflate income or
// spending, and never appear in a category breakdown.
// Start the server, then: npm run verify:transfers
import "dotenv/config";

const BASE = "http://localhost:4000/api";

async function api(path: string, options?: RequestInit): Promise<any> {
  const res = await fetch(`${BASE}${path}`, { headers: { "Content-Type": "application/json" }, ...options });
  const body = await res.json();
  if (!res.ok) throw new Error(`${path}: ${JSON.stringify(body)}`);
  return body;
}
async function rawPost(path: string, body: any): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

let passed = 0;
let failed = 0;
function check(label: string, actual: any, expected: any) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(
    `${ok ? "  PASS" : "  FAIL"}  ${label}` +
      (ok ? "" : `\n          expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  );
  ok ? passed++ : failed++;
}

// The API speaks cents. These scripts read better in dollars, so amounts and
// expected totals are written in dollars and converted here — which also means
// a script can't accidentally assert against a figure in the wrong unit.
const c = (dollars: number) => Math.round(dollars * 100);

const MONTH = { start: "2026-09-01T00:00:00Z", end: "2026-10-01T00:00:00Z" };

(async () => {
  for (const a of await api("/accounts")) if (a.name.startsWith("XFER-")) await api(`/accounts/${a.id}`, { method: "DELETE" });
  for (const a of await api("/accounts/archived")) if (a.name.startsWith("XFER-")) await api(`/accounts/${a.id}/permanent`, { method: "DELETE" });

  const mk = (name: string, type: string) =>
    api("/accounts/manual", {
      method: "POST",
      body: JSON.stringify({ name, institutionName: "XFER-Bank", type, currentBalanceCents: 0 }),
    });
  const checking = await mk("XFER-Checking", "depository");
  const savings = await mk("XFER-Savings", "depository");
  const card = await mk("XFER-Card", "credit");

  // Callers pass dollars; the API takes cents.
  const tx = (acct: any, dollars: number, date: string, name: string) =>
    api("/transactions/manual", {
      method: "POST",
      body: JSON.stringify({ accountId: acct.id, amountCents: c(dollars), date, name }),
    });

  const raw = async () => {
    const d = await api(`/dashboard/income-spending?startDate=${MONTH.start}&endDate=${MONTH.end}`);
    return {
      income: d.totalIncome,
      expenses: d.totalExpenses,
      incomeCats: d.incomeByCategory.map((c: any) => c.name),
      expenseCats: d.expensesByCategory.map((c: any) => c.name),
    };
  };

  // Assertions are on the change this script causes, not on absolute totals.
  // Whatever else is already in the database — real transactions, or leftovers
  // from another script — would otherwise make every number wrong, and running
  // the suite twice would give different answers.
  const baseline = await raw();
  const round = (n: number) => Math.round(n);
  const totals = async () => {
    const now = await raw();
    return {
      income: round(now.income - baseline.income),
      expenses: round(now.expenses - baseline.expenses),
      incomeCats: now.incomeCats,
      expenseCats: now.expenseCats,
    };
  };

  // Real income and real spending, so the transfer's effect is visible against
  // a known baseline rather than against zero.
  await tx(checking, 4000, "2026-09-01", "XFER ACME PAYROLL");
  await tx(card, -120, "2026-09-02", "XFER GROCERY RUN");

  console.log("\nA Zelle between your own accounts:");
  await tx(checking, -1500, "2026-09-10", "Zelle payment to Dami Ogunbode");
  await tx(savings, 1500, "2026-09-10", "Zelle payment from Dami Ogunbode");

  // The path a real sync takes: categorize, then pair.
  await api("/transactions/auto-categorize", { method: "POST" });

  const afterZelle = await totals();
  check("Income excludes the Zelle", afterZelle.income, c(4000));
  check("Spending excludes the Zelle", afterZelle.expenses, c(120));
  check("No Zelle Received in income by category", afterZelle.incomeCats.includes("Zelle Received"), false);
  check("No Zelle Sent in spending by category", afterZelle.expenseCats.includes("Zelle Sent"), false);
  check("No Transfer category in spending by category", afterZelle.expenseCats.includes("Transfer"), false);

  console.log("\nA credit card payment:");
  await tx(checking, -800, "2026-09-14", "XFER CHASE CARD PAYMENT");
  await tx(card, 800, "2026-09-14", "XFER PAYMENT THANK YOU");
  await api("/transactions/auto-categorize", { method: "POST" });

  const afterCard = await totals();
  check("Card payment doesn't become income", afterCard.income, c(4000));
  check("Card payment doesn't become spending", afterCard.expenses, c(120));

  console.log("\nRe-running categorization doesn't undo a match:");
  // Categorization used to relabel a matched Zelle back to "Zelle Sent" and
  // flip its kind, so a transfer started inflating spending again on the next
  // sync even though the user had already matched it.
  await api("/transactions/auto-categorize", { method: "POST" });
  await api("/transactions/auto-categorize", { method: "POST" });
  const afterRerun = await totals();
  check("Income still excludes matched transfers", afterRerun.income, c(4000));
  check("Spending still excludes matched transfers", afterRerun.expenses, c(120));

  console.log("\nMatching by hand, for pairs the detector won't suggest:");
  // Amount differs by a wire fee and the legs are a week apart, so this is
  // below the detector's thresholds on purpose.
  const feeOut = await tx(checking, -2000, "2026-09-03", "XFER WIRE TO BROKERAGE");
  const feeIn = await tx(savings, 1975, "2026-09-11", "XFER WIRE RECEIVED");

  const suggestions = await api("/transfers/detect");
  check(
    "Detector doesn't suggest the mismatched pair",
    suggestions.some((p: any) => p.fromTransaction.id === feeOut.id),
    false
  );

  const unmatched = await api("/transfers/unmatched");
  check(
    "Both sides are offered for manual matching",
    [
      unmatched.outgoing.some((f: any) => f.id === feeOut.id),
      unmatched.incoming.some((f: any) => f.id === feeIn.id),
    ],
    [true, true]
  );

  await api("/transfers/link", {
    method: "POST",
    body: JSON.stringify({ transaction1Id: feeOut.id, transaction2Id: feeIn.id }),
  });
  const afterManual = await totals();
  check("Manually matched pair leaves income alone", afterManual.income, c(4000));
  check("Manually matched pair leaves spending alone", afterManual.expenses, c(120));

  console.log("\nUnmatching puts both sides back:");
  await api("/transfers/unlink", { method: "POST", body: JSON.stringify({ transactionId: feeOut.id }) });
  const afterUnlink = await totals();
  check("The outflow counts as spending again", afterUnlink.expenses, c(120 + 2000));
  check("The inflow counts as income again", afterUnlink.income, c(4000 + 1975));

  console.log("\nA match that can't be right is refused with a reason:");
  const a1 = await tx(checking, -50, "2026-09-20", "XFER ONE");
  const a2 = await tx(checking, 50, "2026-09-20", "XFER TWO");
  const sameAccount = await rawPost("/transfers/link", { transaction1Id: a1.id, transaction2Id: a2.id });
  check("Same account is rejected", sameAccount.status, 400);
  check("Rejection explains why", /same account/i.test(sameAccount.body.error), true);

  const self = await rawPost("/transfers/link", { transaction1Id: a1.id, transaction2Id: a1.id });
  check("A transaction can't pair with itself", self.status, 400);

  const b1 = await tx(savings, -60, "2026-09-21", "XFER THREE");
  const sameDirection = await rawPost("/transfers/link", { transaction1Id: a1.id, transaction2Id: b1.id });
  check("Two outflows are rejected", sameDirection.status, 400);

  // Re-using a leg would leave its former counterpart pointing at a
  // transaction that no longer points back.
  const stealAttempt = await rawPost("/transfers/link", { transaction1Id: feeOut.id, transaction2Id: b1.id });
  check("An already-matched leg can't be re-used", stealAttempt.status, 400);

  console.log("\nMatched pairs are listed so a wrong one can be found:");
  const linkedPairs = await api("/transfers/linked");
  check("Linked list has both legs of a pair", linkedPairs.every((p: any) => p.broken === false), true);

  for (const a of [checking, savings, card]) {
    await api(`/accounts/${a.id}`, { method: "DELETE" });
    await api(`/accounts/${a.id}/permanent`, { method: "DELETE" });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
