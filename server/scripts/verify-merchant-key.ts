// Merchant-key normalization. Run: npm run verify:merchant-key
// No server or database needed — this is pure string handling.
import { merchantKey } from "../src/services/merchantKey";

let passed = 0;
let failed = 0;

// Every descriptor in a group is the same merchant and must share one key,
// otherwise teaching the app about one charge teaches it nothing about the
// next one from the same shop.
const SAME: [string, string[]][] = [
  ["Amazon", ["AMAZON.COM*RT4X9 AMZN.COM/BILL WA", "AMAZON.COM*M12K8 AMZN.COM/BILL WA", "AMAZON MKTPL*2H8K1"]],
  ["Target", ["POS DEBIT 0923 TARGET T-1902 BROOKLYN NY", "TARGET T-4417 QUEENS NY 11101", "TARGET 00012345"]],
  ["Blue Bottle", ["SQ *BLUE BOTTLE COFFEE 8871", "SQ *BLUE BOTTLE COFFEE 2290"]],
  [
    "Starbucks",
    ["PURCHASE AUTHORIZED ON 09/14 STARBUCKS STORE 1234 SEATTLE WA", "STARBUCKS STORE 9987", "STARBUCKS"],
  ],
  ["Whole Foods", ["CHECKCARD 0912 WHOLE FOODS MKT #10432", "WHOLE FOODS MKT 55512"]],
  ["Shell", ["SHELL OIL 574839201", "SHELL OIL 100238471"]],
  ["Netflix", ["NETFLIX.COM", "NETFLIX.COM*8J2K1"]],
  ["Uber", ["UBER TRIP 9XK2", "UBER TRIP 4PP1"]],
  ["Payroll", ["ACME CORP DIRECT DEP PAYROLL", "ACME CORP DIRECT DEP PAYROLL"]],
];

// Different merchants must not collapse into one key, which would apply one
// answer to spending that has nothing to do with it.
const DIFFERENT = [
  "TARGET T-1902",
  "WALMART 553",
  "CVS PHARMACY 8871",
  "WALGREENS 221",
  "SHELL OIL 574839201",
  "CHEVRON 00920",
  "NETFLIX.COM",
  "SPOTIFY USA",
];

function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${ok ? "" : `\n          ${detail}`}`);
  ok ? passed++ : failed++;
}

console.log("Same merchant collapses to one key:");
for (const [label, names] of SAME) {
  const keys = [...new Set(names.map(merchantKey))];
  check(`${label} (${names.length} descriptors)`, keys.length === 1, `got ${JSON.stringify(keys)}`);
}

console.log("\nDifferent merchants stay separate:");
const distinctKeys = DIFFERENT.map(merchantKey);
check(
  `${DIFFERENT.length} distinct merchants`,
  new Set(distinctKeys).size === DIFFERENT.length,
  `got ${JSON.stringify(distinctKeys)}`
);

console.log("\nDegenerate input:");
check("Empty string doesn't throw", merchantKey("") === "");
// A descriptor that is nothing but an id must not normalize to "", or every
// such transaction would land in the same bucket.
check("All-identifier descriptor keeps something", merchantKey("48219 00231") !== "");
check("Whitespace collapses", merchantKey("  SHELL   OIL  ") === "SHELL OIL");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
