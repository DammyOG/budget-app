// Bank descriptors carry a different transaction id on every charge:
//
//   AMAZON.COM*RT4X9 AMZN.COM/BILL WA
//   AMAZON.COM*M12K8 AMZN.COM/BILL WA
//   POS DEBIT 0923 TARGET T-1902 BROOKLYN NY
//   SQ *BLUE BOTTLE COFFEE 8871
//
// Learned rules used to key off the raw string, so teaching the app about one
// Amazon charge taught it nothing about the next one — the rule could only
// ever match the single transaction it came from. That is the main reason
// categorization felt like it never learned anything.
//
// Reducing a descriptor to a stable merchant key makes one answer cover every
// past and future charge from that merchant.

// Payment-processor and card-network noise that prefixes the real merchant.
const PREFIXES = [
  /^pos\s+(debit|purchase|credit)\s*/i,
  /^debit\s+card\s+(purchase|payment)\s*/i,
  /^credit\s+card\s+(purchase|payment)\s*/i,
  /^purchase\s+authorized\s+on\s+\d{1,2}\/\d{1,2}\s*/i,
  /^recurring\s+(payment|debit|charge)\s*/i,
  /^checkcard\s+\d*\s*/i,
  /^check\s?card\s*/i,
  /^ach\s+(debit|credit|payment)\s*/i,
  /^electronic\s+(withdrawal|deposit)\s*/i,
  /^preauthorized\s+(debit|credit)\s*/i,
  /^visa\s+(debit|purchase)\s*/i,
  /^web\s+(payment|id)\s*/i,
  /^sq\s*\*\s*/i, // Square
  /^tst\s*\*\s*/i, // Toast
  /^py\s*\*\s*/i,
  /^paypal\s*\*\s*/i,
  /^pp\s*\*\s*/i,
  /^wwwn?\./i,
  /^www\s*/i,
];

// Trailing location noise: "BROOKLYN NY", "NY 11201", "US".
const TRAILING = [
  /\s+[A-Z]{2}\s+\d{5}(-\d{4})?$/i,
  /\s+\d{5}(-\d{4})?$/,
  /\s+(US|USA)$/i,
];

const US_STATES = new Set(
  ("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR " +
    "PA RI SC SD TN TX UT VT VA WA WV WI WY DC").split(" ")
);

// A token is an identifier — not part of the merchant's name — if it is mostly
// digits or mixes letters and digits in a way names don't.
function isIdentifier(token: string): boolean {
  if (/^\d+$/.test(token)) return true; // 1902, 8871, 0923
  if (/^#\d+$/.test(token)) return true; // #1043
  if (/^x+\d+$/i.test(token)) return true; // xxxx1234
  // Mixed alphanumeric with 2+ digits: RT4X9, T-1902, M12K8.
  if (/[a-z]/i.test(token) && (token.match(/\d/g) || []).length >= 2) return true;
  return false;
}

// Words that survive stripping but carry no merchant identity. The
// marketplace variants matter because "AMAZON MKTPL*2H8K1" and
// "AMAZON.COM*RT4X9" are one merchant as far as a budget is concerned.
const STOPWORDS = new Set([
  "the",
  "inc",
  "llc",
  "ltd",
  "co",
  "corp",
  "company",
  "store",
  "stores",
  "mktpl",
  "mktplace",
  "marketplace",
]);

export function merchantKey(rawName: string): string {
  let s = (rawName || "").trim();
  if (!s) return "";

  for (const re of PREFIXES) s = s.replace(re, "");
  for (const re of TRAILING) s = s.replace(re, "");

  // Split on everything that isn't a letter or digit. This also splits
  // "AMAZON.COM*RT4X9" into AMAZON / COM / RT4X9 so the id can be dropped.
  let tokens = s
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);

  // A store number marks the end of the merchant's name and the start of
  // branch and location detail. Keeping that detail split one merchant across
  // many keys — "TARGET T-1902 BROOKLYN" and "TARGET T-4417 QUEENS" are the
  // same shop as far as categorizing goes.
  while (tokens.length && isIdentifier(tokens[0])) tokens.shift(); // leading date/batch ids
  const firstId = tokens.findIndex(isIdentifier);
  if (firstId > 0) tokens = tokens.slice(0, firstId);

  // Drop a trailing bare state code ("TARGET BROOKLYN NY" -> "TARGET BROOKLYN").
  while (tokens.length > 1 && US_STATES.has(tokens[tokens.length - 1])) tokens.pop();

  tokens = tokens.filter((t) => !isIdentifier(t) && !STOPWORDS.has(t.toLowerCase()));

  // Web suffixes add nothing once the brand is present.
  tokens = tokens.filter((t) => !["COM", "NET", "ORG", "WWW", "BILL"].includes(t));

  // A trailing single letter is the leftover of a split store code —
  // "TARGET T-1902" tokenizes to TARGET / T / 1902, and keeping the T made it
  // a different merchant from "TARGET 00012345".
  while (tokens.length > 1 && tokens[tokens.length - 1].length === 1) tokens.pop();

  // Everything was noise — fall back to the original so the key is never
  // empty, which would collapse unrelated transactions into one bucket.
  if (tokens.length === 0) {
    return rawName.trim().toUpperCase().replace(/\s+/g, " ");
  }

  // Merchants append branch detail ("STARBUCKS STORE 1234 BROOKLYN"); the
  // first few tokens carry the identity and keep branches together.
  return tokens.slice(0, 4).join(" ");
}

// Tokens for the classifier. Same cleaning, but no length cap: later tokens
// still carry signal ("BLUE BOTTLE COFFEE" -> coffee).
export function merchantTokens(rawName: string): string[] {
  const key = merchantKey(rawName);
  return key.split(" ").filter((t) => t.length > 1);
}
