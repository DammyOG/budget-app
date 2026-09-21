// Verifies the transaction list ordering/collapsing/duplicate algorithm.
// Start the server, then: npx tsx scripts/verify-transaction-list.ts
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

const DAY = "2026-07-15";

(async () => {
  for (const a of await api("/accounts")) {
    if (a.name.startsWith("LIST-")) await api(`/accounts/${a.id}`, { method: "DELETE" });
  }
  for (const a of await api("/accounts/archived")) {
    if (a.name.startsWith("LIST-")) await api(`/accounts/${a.id}/permanent`, { method: "DELETE" });
  }

  const mk = (name: string, type: string) =>
    api("/accounts/manual", {
      method: "POST",
      body: JSON.stringify({ name, institutionName: "LIST-Bank", type, currentBalance: 0 }),
    });
  const checking = await mk("LIST-Checking", "depository");
  const savings = await mk("LIST-Savings", "depository");

  const tx = (body: any) => api("/transactions/manual", { method: "POST", body: JSON.stringify(body) });

  // 25 transactions all on the SAME day — every one a tie under date sort.
  // This is what used to make offset pagination unstable.
  for (let i = 1; i <= 25; i++) {
    await tx({ accountId: checking.id, amount: i, date: DAY, name: `Same Day ${String(i).padStart(2, "0")}` });
  }

  console.log("\nSame-day tie-break (biggest first):");
  const firstPage = await api(`/transactions?limit=5&startDate=${DAY}&endDate=${DAY}`);
  check(
    "Largest same-day amount leads",
    firstPage.transactions.slice(0, 3).map((t: any) => t.amount),
    [25, 24, 23]
  );

  console.log("\nPagination stability across ties:");
  // Page through in small pages; with 25 tied rows, an unstable sort would
  // repeat or drop rows between pages.
  const seen: string[] = [];
  for (let off = 0; off < 25; off += 5) {
    const page = await api(`/transactions?limit=5&offset=${off}&startDate=${DAY}&endDate=${DAY}`);
    seen.push(...page.transactions.map((t: any) => t.id));
  }
  check("Paged through all 25 rows", seen.length, 25);
  check("No row repeated across pages", new Set(seen).size, 25);
  const descending = await api(`/transactions?limit=100&startDate=${DAY}&endDate=${DAY}`);
  check(
    "Paged order matches single-query order",
    seen,
    descending.transactions.map((t: any) => t.id)
  );

  console.log("\nSort by amount (magnitude, not signed):");
  await tx({ accountId: checking.id, amount: -3000, date: DAY, name: "Big Paycheck", kind: "income" });
  const byAmount = await api(`/transactions?sort=amount&dir=desc&limit=3&startDate=${DAY}&endDate=${DAY}`);
  check(
    "A large inflow ranks as big, not last",
    byAmount.transactions[0].name,
    "Big Paycheck"
  );

  console.log("\nSort by name:");
  const byName = await api(`/transactions?sort=name&dir=asc&limit=1&startDate=${DAY}&endDate=${DAY}`);
  check("Ascending name sort", byName.transactions[0].name, "Big Paycheck");

  console.log("\nTransfer pair collapsing:");
  const out = await tx({ accountId: checking.id, amount: 500, date: DAY, name: "Transfer Out" });
  const inn = await tx({ accountId: savings.id, amount: -500, date: DAY, name: "Transfer In" });
  await api("/transfers/link", {
    method: "POST",
    body: JSON.stringify({ transaction1Id: out.id, transaction2Id: inn.id }),
  });

  const collapsed = await api(`/transactions?limit=100&startDate=${DAY}&endDate=${DAY}`);
  const names = collapsed.transactions.map((t: any) => t.name);
  check("Inflow leg hidden", names.includes("Transfer In"), false);
  check("Outflow leg kept", names.includes("Transfer Out"), true);
  check(
    "Surviving leg names the other account",
    collapsed.transactions.find((t: any) => t.name === "Transfer Out")?.transferCounterpartAccount,
    "LIST-Savings"
  );

  console.log("\nCollapsing is off when viewing one account's ledger:");
  // Otherwise the savings account's own ledger would be missing the $500
  // that actually landed in it.
  const savingsLedger = await api(`/transactions?limit=100&accountId=${savings.id}`);
  check(
    "Savings still shows its own incoming leg",
    savingsLedger.transactions.map((t: any) => t.name).includes("Transfer In"),
    true
  );
  check("Response reports it did not collapse", savingsLedger.collapsed, false);

  console.log("\nDuplicate detection:");
  await tx({ accountId: checking.id, amount: 12.99, date: DAY, name: "NETFLIX" });
  await tx({ accountId: checking.id, amount: 12.99, date: DAY, name: "NETFLIX" });
  await tx({ accountId: checking.id, amount: 9.99, date: DAY, name: "SPOTIFY" });

  const withDupes = await api(`/transactions?limit=100&startDate=${DAY}&endDate=${DAY}`);
  const netflix = withDupes.transactions.filter((t: any) => t.name === "NETFLIX");
  const spotify = withDupes.transactions.find((t: any) => t.name === "SPOTIFY");
  check("Both halves of the double charge flagged", netflix.map((t: any) => t.isDuplicate), [true, true]);
  check("A one-off charge is not flagged", spotify.isDuplicate, false);

  const onlyDupes = await api(`/transactions?limit=100&duplicatesOnly=true&startDate=${DAY}&endDate=${DAY}`);
  check("duplicatesOnly returns just the duplicates", onlyDupes.transactions.every((t: any) => t.isDuplicate), true);
  // The count has to describe the filtered set. Filtering the fetched page
  // after counting made the footer read "9 transactions" under 2 visible rows.
  check("duplicatesOnly total matches what's shown", onlyDupes.total, onlyDupes.transactions.length);
  check("duplicatesOnly reports nothing more to load", onlyDupes.hasMore, false);
  const dupePage = await api(`/transactions?limit=1&duplicatesOnly=true&startDate=${DAY}&endDate=${DAY}`);
  check("duplicatesOnly paginates over the narrowed set", [dupePage.transactions.length, dupePage.total, dupePage.hasMore], [1, 2, true]);

  console.log("\nA failing request doesn't take the server down:");
  // Deleting a row that isn't there makes Prisma throw inside an async handler.
  // Express 4 doesn't await handlers, so this used to surface as an unhandled
  // rejection, kill the process, and 502 every request after it.
  const deadRes = await fetch(`${BASE}/transactions/no-such-id`, { method: "DELETE" });
  check("Bad request answered with 500, not a dropped connection", deadRes.status, 500);
  const stillUp = await fetch(`${BASE}/health`);
  check("Server still serving afterwards", stillUp.status, 200);

  console.log("\nAttention counts:");
  const attention = await api("/transactions/attention");
  check("Duplicate group counted once, not per row", attention.duplicateGroups >= 1, true);
  check("Uncategorized counted", attention.uncategorized > 0, true);

  for (const a of [checking, savings]) {
    await api(`/accounts/${a.id}`, { method: "DELETE" });
    await api(`/accounts/${a.id}/permanent`, { method: "DELETE" });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
