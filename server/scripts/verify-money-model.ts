// End-to-end verification of the money model without needing Plaid.
// Start the server, then run: npm run verify:money-model
import "dotenv/config";

const BASE = "http://localhost:4000/api";

async function api(path: string, options?: RequestInit): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${path}: ${JSON.stringify(body)}`);
  return body;
}

const MONTH = "2026-05";
const d = (day: number) => `${MONTH}-${String(day).padStart(2, "0")}`;

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

(async () => {
  // Clean slate: drop anything left behind by a previous run.
  for (const a of await api("/accounts")) {
    if (a.name.startsWith("VERIFY-")) await api(`/accounts/${a.id}`, { method: "DELETE" });
  }

  const mkAccount = (name: string, institutionName: string, type: string, currentBalance: number) =>
    api("/accounts/manual", {
      method: "POST",
      body: JSON.stringify({ name, institutionName, type, currentBalance }),
    });

  const checking = await mkAccount("VERIFY-Checking", "VERIFY-BofA", "depository", 5000);
  const savings = await mkAccount("VERIFY-Savings", "VERIFY-Ally", "depository", 10000);
  const card = await mkAccount("VERIFY-Card", "VERIFY-Chase", "credit", 1200);

  const categories = await api("/categories");
  const byName = (n: string) => categories.find((c: any) => c.name === n);
  const shopping = byName("Shopping");
  const groceries = byName("Groceries");
  const salary = byName("Salary");

  const tx = (body: any) => api("/transactions/manual", { method: "POST", body: JSON.stringify(body) });

  // Zelle between two of my own accounts, legs settling 2 days apart.
  const zelleOut = await tx({ accountId: checking.id, amount: 500, date: d(10), name: "Zelle Transfer To Ally" });
  const zelleIn = await tx({ accountId: savings.id, amount: -500, date: d(12), name: "Zelle Transfer From BofA" });

  // Credit card payment — the double-count case.
  const cardPayOut = await tx({ accountId: checking.id, amount: 1200, date: d(15), name: "Chase Card Payment" });
  const cardPayIn = await tx({ accountId: card.id, amount: -1200, date: d(15), name: "Payment Thank You" });

  // Payroll.
  await tx({ accountId: checking.id, amount: -3000, date: d(1), name: "ACME PAYROLL", categoryId: salary.id });

  // Real spending, plus a refund against the same category.
  await tx({ accountId: card.id, amount: 200, date: d(5), name: "Amazon Order", categoryId: shopping.id });
  await tx({ accountId: card.id, amount: -40, date: d(20), name: "Amazon Refund", categoryId: shopping.id });
  await tx({ accountId: card.id, amount: 150, date: d(7), name: "Whole Foods", categoryId: groceries.id });

  // Pair the two transfers explicitly (mirrors what auto-detection does).
  await api("/transfers/link", {
    method: "POST",
    body: JSON.stringify({ transaction1Id: zelleOut.id, transaction2Id: zelleIn.id }),
  });
  await api("/transfers/link", {
    method: "POST",
    body: JSON.stringify({ transaction1Id: cardPayOut.id, transaction2Id: cardPayIn.id }),
  });

  const all = await api("/transactions?limit=200");
  const t = (name: string) => all.find((x: any) => x.name === name);

  console.log("\nTransfer pairing:");
  check("Zelle out is a transfer", t("Zelle Transfer To Ally").kind, "transfer");
  check("Zelle in is a transfer", t("Zelle Transfer From BofA").kind, "transfer");
  check("Zelle legs linked", t("Zelle Transfer To Ally").transferPairId, zelleIn.id);
  check("Card payment out is a transfer", t("Chase Card Payment").kind, "transfer");
  check("Card payment in is a transfer", t("Payment Thank You").kind, "transfer");

  console.log("\nKind follows category:");
  check("Payroll is income", t("ACME PAYROLL").kind, "income");
  check("Purchase is an expense", t("Amazon Order").kind, "expense");
  check("Refund stays an expense (not income)", t("Amazon Refund").kind, "expense");

  console.log("\nDashboard /summary:");
  const summary = await api(`/dashboard/summary?month=${MONTH}`);
  // Spending = 200 (Amazon) - 40 (refund) + 150 (Whole Foods) = 310.
  // The 500 Zelle and 1200 card payment are transfers and must not appear.
  check("Income is payroll only", summary.income, 3000);
  check("Spending excludes transfers, nets refund", summary.spending, 310);
  check("Net cash flow", summary.netCashFlow, 2690);
  check(
    "Refund reduces Shopping (200-40)",
    summary.spendingByCategory.find((c: any) => c.name === "Shopping")?.total,
    160
  );
  check(
    "No transfer leaked into spending categories",
    summary.spendingByCategory.some((c: any) => c.total === 500 || c.total === 1200),
    false
  );

  console.log("\nDashboard /income-spending (must agree with /summary):");
  const range = await api(
    `/dashboard/income-spending?startDate=${MONTH}-01&endDate=${MONTH}-31&groupBy=month`
  );
  check("Same income as /summary", range.totalIncome, summary.income);
  check("Same spending as /summary", range.totalExpenses, summary.spending);
  check("Refund not counted as income", range.incomeByCategory.some((c: any) => c.name === "Shopping"), false);
  check(
    "Shopping nets to 160 here too",
    range.expensesByCategory.find((c: any) => c.name === "Shopping")?.total,
    160
  );
  check("Monthly breakdown income", range.byMonth[0]?.income, 3000);
  check("Monthly breakdown expenses", range.byMonth[0]?.expenses, 310);

  console.log("\nOverride durability:");
  // Reclassifying a transfer as spending must break the pair, not orphan it.
  await api(`/transactions/${zelleOut.id}`, {
    method: "PATCH",
    body: JSON.stringify({ kind: "expense" }),
  });
  const after = await api("/transactions?limit=200");
  const reclassified = after.find((x: any) => x.id === zelleOut.id);
  const counterpart = after.find((x: any) => x.id === zelleIn.id);

  check("Manual kind applied", reclassified.kind, "expense");
  check("kindLocked set", reclassified.kindLocked, true);
  check("Pair broken on this leg", reclassified.transferPairId, null);
  check("Counterpart not orphaned", counterpart.transferPairId, null);
  // If the counterpart also reverted to "expense", its negative amount would
  // cancel this leg out and spending would appear unchanged.
  check("Counterpart reverts by its own direction", counterpart.kind, "income");

  const summary2 = await api(`/dashboard/summary?month=${MONTH}`);
  check("Reclassified leg now counts as spending", summary2.spending, 810);
  check("Freed counterpart now counts as income", summary2.income, 3500);

  // Auto-categorization must not overwrite a hand-set kind.
  await api("/transactions/auto-categorize", { method: "POST" });
  const afterAuto = (await api("/transactions?limit=200")).find((x: any) => x.id === zelleOut.id);
  check("Manual kind survives auto-categorize", afterAuto.kind, "expense");

  for (const a of [checking, savings, card]) await api(`/accounts/${a.id}`, { method: "DELETE" });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
