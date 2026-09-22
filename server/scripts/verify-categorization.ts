// Verifies that categorization generalizes from a few answers.
// Start the server, then: npm run verify:categorization
import "dotenv/config";

const BASE = "http://localhost:4000/api";

async function api(path: string, options?: RequestInit): Promise<any> {
  const res = await fetch(`${BASE}${path}`, { headers: { "Content-Type": "application/json" }, ...options });
  const body = await res.json();
  if (!res.ok) throw new Error(`${path}: ${JSON.stringify(body)}`);
  return body;
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

const D = (n: number) => new Date(Date.UTC(2026, 8, n)).toISOString().slice(0, 10);

(async () => {
  for (const a of await api("/accounts")) if (a.name.startsWith("CAT-")) await api(`/accounts/${a.id}`, { method: "DELETE" });
  for (const a of await api("/accounts/archived")) if (a.name.startsWith("CAT-")) await api(`/accounts/${a.id}/permanent`, { method: "DELETE" });

  const acct = await api("/accounts/manual", {
    method: "POST",
    body: JSON.stringify({ name: "CAT-Card", institutionName: "CAT-Bank", type: "credit", currentBalance: 0 }),
  });
  const categories = await api("/categories");
  const cat = (n: string) => categories.find((c: any) => c.name === n).id;
  const tx = (name: string, amount: number, day: number) =>
    api("/transactions/manual", { method: "POST", body: JSON.stringify({ accountId: acct.id, amount, date: D(day), name }) });

  // A merchant with a different order id on every charge — the case that made
  // learned rules useless, because each descriptor is unique. Names are
  // prefixed so they can't collide with real merchants in the database: a rule
  // correctly applying to the user's own transactions would otherwise look
  // like a failure here.
  console.log("\nOne answer covers every charge from that merchant:");
  const gym = [
    await tx("ZZVERIFY FITNESS *8823 ARLINGTON VA", 42.5, 2),
    await tx("ZZVERIFY FITNESS *2291 ARLINGTON VA", 42.5, 9),
    await tx("ZZVERIFY FITNESS *7734 ARLINGTON VA", 42.5, 16),
  ];
  const before = await api("/transactions?limit=200");
  check(
    "All three start uncategorized",
    before.transactions.filter((t: any) => gym.some((g: any) => g.id === t.id) && !t.categoryId).length,
    3
  );

  const taught = await api("/transactions/teach", {
    method: "POST",
    body: JSON.stringify({ transactionName: gym[0].name, categoryId: cat("Health & Fitness") }),
  });
  check("Teaching one answer back-fills the other charges", taught.applied, 3);

  const after = await api("/transactions?limit=200");
  const gymRows = after.transactions.filter((t: any) => gym.some((g: any) => g.id === t.id));
  check("All three now categorized", gymRows.map((t: any) => t.category?.name), [
    "Health & Fitness",
    "Health & Fitness",
    "Health & Fitness",
  ]);

  // The point of the rule: it has to apply to charges that arrive later too.
  console.log("\nA later charge from a taught merchant is categorized on sync:");
  const laterGym = await tx("ZZVERIFY FITNESS *9910 ARLINGTON VA", 42.5, 23);
  await api("/transactions/auto-categorize", { method: "POST" });
  const withLater = await api("/transactions?limit=200");
  check(
    "New charge picked up the taught category",
    withLater.transactions.find((t: any) => t.id === laterGym.id)?.category?.name,
    "Health & Fitness"
  );

  // The classifier generalizes past exact merchant matches, which is what
  // stops an unknown shop sitting uncategorized forever.
  console.log("\nThe model generalizes to a merchant it has never seen:");
  for (const [name, day] of [
    ["COMPASS COFFEE 12", 6.5, ] as any,
    ["COMPASS COFFEE 4", 5.25],
    ["SWINGS COFFEE ROASTERS", 7.0],
    ["LA COLOMBE COFFEE", 6.25],
  ] as [string, number][]) {
    const t = await tx(name, 6, 11);
    await api(`/transactions/${t.id}`, { method: "PATCH", body: JSON.stringify({ categoryId: cat("Dining & Restaurants") }) });
  }
  // Enough history for a few more categories so the prior isn't degenerate.
  for (const name of ["SAFEWAY 1123", "SAFEWAY 8890", "GIANT FOOD 221"]) {
    const t = await tx(name, 55, 12);
    await api(`/transactions/${t.id}`, { method: "PATCH", body: JSON.stringify({ categoryId: cat("Groceries") }) });
  }

  const unseen = await tx("ZZVERIFY COFFEE ROASTERS", 5.75, 20);
  const queue = await api("/transactions/teach?limit=20");
  const guess = queue.merchants.find((m: any) => m.sampleName === "ZZVERIFY COFFEE ROASTERS")?.guess;
  check("Unseen coffee shop is guessed as dining", guess?.categoryName, "Dining & Restaurants");
  check("Guess carries a confidence", typeof guess?.confidence === "number" && guess.confidence > 0, true);

  console.log("\nThe teach queue is ranked by what answering resolves:");
  for (let i = 0; i < 6; i++) await tx(`ZZVERIFY HARDWARE ${1000 + i}`, 80, 14);
  await tx("ZZVERIFY ONEOFF 5512", 3, 15);
  const ranked = await api("/transactions/teach?limit=20");
  const hardwareIdx = ranked.merchants.findIndex((m: any) => m.merchantKey.includes("ZZVERIFY HARDWARE"));
  const oneOffIdx = ranked.merchants.findIndex((m: any) => m.merchantKey.includes("ZZVERIFY ONEOFF"));
  check("Six $80 charges outrank one $3 charge", hardwareIdx < oneOffIdx, true);
  check(
    "Merchants are grouped, not listed per transaction",
    ranked.merchants.find((m: any) => m.merchantKey.includes("ZZVERIFY HARDWARE"))?.count,
    6
  );

  console.log("\nCoverage is reported so 'did it do everything' has an answer:");
  const report = await api("/transactions/auto-categorize", { method: "POST" });
  check("Report includes remaining count", typeof report.remaining === "number", true);
  check("Report includes coverage", typeof report.coverage === "number", true);
  check("Report says how much the model trained on", typeof report.modelTrainedOn === "number", true);

  // Teaching the remaining merchants must clear the backlog. Scoped to this
  // script's own account: an earlier version answered every merchant in the
  // queue, which on a real ledger would have relabelled the user's actual
  // spending as "Shopping".
  const mine = async () => {
    const { transactions } = await api(`/transactions?limit=500&accountId=${acct.id}`);
    return transactions.filter((t: any) => !t.categoryId && t.kind !== "transfer");
  };
  let guard = 0;
  while (guard++ < 25) {
    const left = await mine();
    if (left.length === 0) break;
    await api("/transactions/teach", {
      method: "POST",
      body: JSON.stringify({ transactionName: left[0].name, categoryId: cat("Shopping") }),
    });
  }
  check("Answering every merchant leaves nothing uncategorized", (await mine()).length, 0);

  const coverageReport = await api("/transactions/auto-categorize", { method: "POST" });
  check("Coverage is a fraction between 0 and 1", coverageReport.coverage >= 0 && coverageReport.coverage <= 1, true);

  console.log("\nIncome & Spending compares against the period before:");
  // byMonth only covers the selected range, so a single-month view had one
  // bucket and the client's charts (>1) and comparison (>=2) never rendered.
  const augTx = await api("/transactions/manual", {
    method: "POST",
    body: JSON.stringify({ accountId: acct.id, amount: -1000, date: "2026-08-10", name: "CAT-PRIOR PAYROLL", kind: "income" }),
  });
  const sepTx = await api("/transactions/manual", {
    method: "POST",
    body: JSON.stringify({ accountId: acct.id, amount: -1500, date: "2026-09-10", name: "CAT-CURRENT PAYROLL", kind: "income" }),
  });
  const sep = await api("/dashboard/income-spending?startDate=2026-09-01T00:00:00Z&endDate=2026-10-01T00:00:00Z&groupBy=month");
  check("Selected month income", sep.totalIncome >= 1500, true);
  check("Previous period is the month before", sep.previous.startDate.slice(0, 10), "2026-08-01");
  check("Previous month's income is reported", sep.previous.totalIncome >= 1000, true);
  check("Trend spans 12 months even for a one-month view", sep.trend.length, 12);
  check("Trend includes the selected month", sep.trend.some((m: any) => m.month === "2026-09"), true);
  check("Trend includes the prior month", sep.trend.some((m: any) => m.month === "2026-08"), true);

  // A year view must step back a whole year, not 365 days from the start.
  const year = await api("/dashboard/income-spending?startDate=2026-01-01T00:00:00Z&endDate=2027-01-01T00:00:00Z&groupBy=month");
  check("Year view compares against the previous year", year.previous.startDate.slice(0, 10), "2025-01-01");
  check("Year view previous ends where this year starts", year.previous.endDate.slice(0, 10), "2026-01-01");

  await api(`/transactions/${augTx.id}`, { method: "DELETE" });
  await api(`/transactions/${sepTx.id}`, { method: "DELETE" });

  await api(`/accounts/${acct.id}`, { method: "DELETE" });
  await api(`/accounts/${acct.id}/permanent`, { method: "DELETE" });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
