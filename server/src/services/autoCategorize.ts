import { prisma } from "../db";
import { kindForCategory } from "./transactionKind";
import { AUTO_APPLY_CONFIDENCE, predict, trainModel, type TrainedModel } from "./classifier";
import { findRuleFor } from "./categorizationLearning";

// Auto-categorization rules based on transaction name patterns
// Rules are evaluated in order, first match wins
const CATEGORIZATION_RULES: { pattern: RegExp; category: string }[] = [
  // Income
  { pattern: /zelle payment from|zelle received|zelle from/i, category: "Zelle Received" },
  { pattern: /payroll|salary|direct deposit|wages|employer|paycheck/i, category: "Salary" },
  { pattern: /freelance|consulting|contractor|1099|self.?employed/i, category: "Freelance" },
  { pattern: /dividend|interest income|capital gains|investment income/i, category: "Investment Income" },

  // Credit Card Rewards & Cashback (before generic refund pattern)
  { pattern: /rewards? redemption|redeem.*rewards?|points? redemption/i, category: "Rewards & Cashback" },
  { pattern: /cashback|cash back|statement credit/i, category: "Rewards & Cashback" },
  { pattern: /chase ultimate rewards|amex.*rewards?|membership rewards|capital one rewards/i, category: "Rewards & Cashback" },
  { pattern: /discover cashback|citi.*rewards?|thank you points/i, category: "Rewards & Cashback" },
  { pattern: /credit card rewards|cc rewards|card rewards/i, category: "Rewards & Cashback" },

  // Refunds deliberately have NO rule of their own. A refund reverses a
  // purchase rather than earning money, so it should land in the same category
  // as the purchase and net against it — "AMAZON REFUND" falls through to the
  // Amazon rule below and reduces Shopping. Categorizing refunds as income
  // both inflated income and left the original category overstated.

  // Transfers (important - these should NOT count as spending)
  // Credit card payments
  { pattern: /payment to crd|payment from crd|crd.*payment/i, category: "Transfer" },
  { pattern: /credit card payment|cc payment|card payment/i, category: "Transfer" },
  { pattern: /autopay|auto payment|automatic payment/i, category: "Transfer" },

  // Generic transfers
  { pattern: /^transfer|online banking payment|mobile banking payment/i, category: "Transfer" },
  { pattern: /ach transfer|wire transfer|bank transfer/i, category: "Transfer" },
  { pattern: /withdrawal.*to.*account|internal.*transfer/i, category: "Transfer" },

  // Investment/Brokerage deposits (these are moving money, not spending)
  { pattern: /deposit.*robinhood|robinhood.*deposit|robinhood.*transfer/i, category: "Transfer" },
  { pattern: /deposit.*ally|ally.*deposit|ally.*transfer/i, category: "Transfer" },
  { pattern: /deposit.*schwab|schwab.*deposit|schwab.*transfer/i, category: "Transfer" },
  { pattern: /deposit.*fidelity|fidelity.*deposit|fidelity.*transfer/i, category: "Transfer" },
  { pattern: /deposit.*vanguard|vanguard.*deposit|vanguard.*transfer/i, category: "Transfer" },
  { pattern: /deposit.*e\*trade|e\*trade.*deposit|etrade/i, category: "Transfer" },

  // Bank to bank transfers
  { pattern: /from.*checking|from.*savings|to.*checking|to.*savings/i, category: "Transfer" },

  // Zelle sent
  { pattern: /zelle payment to|zelle sent|zelle to/i, category: "Zelle Sent" },

  // Groceries & Supermarkets (most comprehensive)
  { pattern: /wegmans|whole foods|trader joe|safeway|giant|kroger|publix|albertsons|food lion|harris teeter/i, category: "Groceries" },
  { pattern: /walmart|target|costco|sam's club|bj's|aldi|lidl|stop & shop|shoprite|king soopers/i, category: "Groceries" },
  { pattern: /sprouts|fresh market|market basket|hannaford|food bazaar|fairway|key food/i, category: "Groceries" },
  { pattern: /grocery|supermarket|market|grocer/i, category: "Groceries" },

  // Dining & Restaurants (very comprehensive)
  { pattern: /restaurant|dining|chipotle|mcdon|burger king|wendy's|taco bell|kfc|popeyes|chick.?fil.?a/i, category: "Dining & Restaurants" },
  { pattern: /subway|arby's|five guys|shake shack|in.?n.?out|whataburger|sonic|del taco|jack in the box/i, category: "Dining & Restaurants" },
  { pattern: /pizza|domino|papa john|little caesar|pizza hut|sbarro/i, category: "Dining & Restaurants" },
  { pattern: /starbucks|dunkin|dutch bros|peet's|caribou|tim horton|coffee|cafe|bakery|diner/i, category: "Dining & Restaurants" },
  { pattern: /panera|sweetgreen|cava|dig inn|chopt|tender green/i, category: "Dining & Restaurants" },
  { pattern: /doordash|uber eats|grubhub|postmates|seamless|caviar|delivery/i, category: "Dining & Restaurants" },
  { pattern: /bar & grill|steakhouse|sushi|thai|chinese|mexican|italian|japanese|korean/i, category: "Dining & Restaurants" },
  { pattern: /olive garden|red lobster|applebee|chili's|outback|texas roadhouse|longhorn/i, category: "Dining & Restaurants" },

  // Gas/Transportation
  { pattern: /exxon|shell|bp |chevron|mobil|texaco|sunoco|wawa|speedway|racetrac|circle k|7.?eleven/i, category: "Transportation" },
  { pattern: /arco|marathon|gulf|conoco|phillips 66|valero|pilot|flying j/i, category: "Transportation" },
  { pattern: /\bgas\b|fuel|gasoline|petrol/i, category: "Transportation" },
  { pattern: /uber|lyft|taxi|cab|rideshare/i, category: "Transportation" },
  { pattern: /metro|subway|transit|train|bus|parking|toll|ezpass|e.?z.?pass/i, category: "Transportation" },
  { pattern: /auto|car wash|oil change|tire|mechanic|repair|dmv/i, category: "Transportation" },

  // Entertainment & Media
  { pattern: /amc|cinema|movie|theater|theatre|regal|cinemark|imax/i, category: "Entertainment" },
  { pattern: /netflix|hulu|disney\+|disney plus|hbo|max|paramount|peacock|apple tv|amazon prime video/i, category: "Entertainment" },
  { pattern: /spotify|apple music|youtube music|pandora|tidal|soundcloud/i, category: "Entertainment" },
  { pattern: /steam|playstation|xbox|nintendo|epic games|blizzard|riot games/i, category: "Entertainment" },
  { pattern: /concert|show|event|ticket|ticketmaster|stubhub|live nation/i, category: "Entertainment" },

  // Health & Fitness
  { pattern: /gym|fitness|planet fitness|la fitness|24 hour|equinox|crunch|lifetime|orange theory|crossfit/i, category: "Health & Fitness" },
  { pattern: /cvs|walgreen|rite aid|pharmacy|drug store|prescription/i, category: "Health & Fitness" },
  { pattern: /doctor|dental|dentist|medical|hospital|clinic|healthcare|health care/i, category: "Health & Fitness" },
  { pattern: /vitamin|supplement|gnc|nutrition/i, category: "Health & Fitness" },

  // Utilities & Bills
  { pattern: /electric|electricity|power|energy|pge|sce|comed|duke energy|con edison|pseg/i, category: "Utilities" },
  { pattern: /water|sewer|trash|waste|sanitation/i, category: "Utilities" },
  { pattern: /gas bill|natural gas/i, category: "Utilities" },
  { pattern: /internet|cable|wifi|broadband|verizon|at&t|comcast|xfinity|spectrum|cox|optimum|frontier/i, category: "Utilities" },
  { pattern: /t.?mobile|sprint|metropcs|cricket|boost mobile|visible|mint mobile/i, category: "Utilities" },
  { pattern: /utility|utilities/i, category: "Utilities" },

  // Shopping (very comprehensive)
  { pattern: /amazon|amzn|prime|aws/i, category: "Shopping" },
  { pattern: /ebay|etsy|mercari|poshmark|depop/i, category: "Shopping" },
  { pattern: /best buy|walmart|target|costco|sam's club/i, category: "Shopping" },
  { pattern: /apple|microsoft|dell|hp |lenovo|asus/i, category: "Shopping" },
  { pattern: /home depot|lowe's|ace hardware|menards|harbor freight/i, category: "Shopping" },
  { pattern: /macy's|nordstrom|dillard|kohl's|jcpenney|tj maxx|marshalls|ross/i, category: "Shopping" },
  { pattern: /nike|adidas|foot locker|finish line|dick's sporting|rei |cabela|bass pro/i, category: "Shopping" },
  { pattern: /old navy|gap|banana republic|h&m|zara|forever 21|uniqlo|urban outfitter/i, category: "Shopping" },
  { pattern: /sephora|ulta|cosmetic|beauty|makeup/i, category: "Shopping" },
  { pattern: /bed bath|bath & body|yankee candle|ikea|wayfair|pottery barn|williams sonoma/i, category: "Shopping" },
  { pattern: /staples|office depot|office max/i, category: "Shopping" },

  // Subscriptions & Memberships
  { pattern: /subscription|membership|annual fee|monthly fee/i, category: "Subscriptions" },
  { pattern: /adobe|microsoft 365|office 365|google one|icloud|dropbox|onedrive/i, category: "Subscriptions" },
  { pattern: /patreon|substack|medium|audible/i, category: "Subscriptions" },

  // Rent & Mortgage
  { pattern: /rent|landlord|property management|lease/i, category: "Rent & Mortgage" },
  { pattern: /mortgage|loan payment|home loan/i, category: "Rent & Mortgage" },

  // Insurance
  { pattern: /insurance|geico|progressive|state farm|allstate|farmers|liberty mutual|usaa/i, category: "Insurance" },

  // Personal Care
  { pattern: /salon|barber|hair|spa|massage|nail|manicure|pedicure/i, category: "Personal Care" },
  { pattern: /dry clean|laundry|tailor/i, category: "Personal Care" },

  // Education
  { pattern: /tuition|university|college|school|education|course|udemy|coursera|skillshare/i, category: "Education" },
  { pattern: /book|kindle|barnes|audible|textbook/i, category: "Education" },

  // Travel
  { pattern: /airline|flight|delta|united|american airlines|southwest|jetblue|spirit|frontier/i, category: "Travel" },
  { pattern: /hotel|marriott|hilton|hyatt|ihg|airbnb|vrbo|booking\.com|expedia/i, category: "Travel" },
  { pattern: /rental car|hertz|enterprise|avis|budget|national|alamo/i, category: "Travel" },

  // Gifts & Donations
  { pattern: /charity|donation|donate|nonprofit|foundation/i, category: "Gifts & Donations" },
  { pattern: /gift|present|flowers|hallmark/i, category: "Gifts & Donations" },

  // Fees & Charges
  { pattern: /fee|charge|service charge|atm|overdraft|late fee|penalty/i, category: "Fees & Charges" },
];

// The rules table names categories, so matching a rule needs a name-to-id
// lookup. Doing it per match meant a query for every rule hit across the whole
// ledger; there are only a couple of dozen categories and they barely change,
// so the map is built once and reused for the rest of the request.
let categoryCache: { at: number; byName: Map<string, { id: string; name: string }> } | null = null;
const CATEGORY_CACHE_MS = 5_000;

async function categoriesByName() {
  if (categoryCache && Date.now() - categoryCache.at < CATEGORY_CACHE_MS) return categoryCache.byName;
  const rows = await prisma.category.findMany({ select: { id: true, name: true } });
  const byName = new Map(rows.map((c) => [c.name, c]));
  categoryCache = { at: Date.now(), byName };
  return byName;
}

// Applies a category and keeps "kind" consistent with it, unless the user has
// overridden the kind by hand — in which case their choice wins.
async function applyCategory(
  transactionId: string,
  categoryId: string,
  kindLocked: boolean
) {
  await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      categoryId,
      ...(kindLocked ? {} : { kind: await kindForCategory(categoryId) }),
    },
  });
}

export async function autoCategorizeTransaction(
  transactionId: string,
  transactionName: string,
  // Passed in by autoCategorizeAll so the model is trained once for the whole
  // run rather than re-trained per transaction.
  model?: TrainedModel | null
) {
  // Get the transaction to check account type
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { account: true, transferAsOutgoing: true, transferAsIncoming: true },
  });

  if (!transaction) return null;

  // A matched transfer's category is settled by the pairing. Without this,
  // re-running categorization relabels "Zelle payment to ..." back to Zelle
  // Sent and flips kind to expense, so a transfer the user had already
  // matched starts inflating spending again on the next sync.
  if (transaction.transferAsOutgoing || transaction.transferAsIncoming) return null;

  // Special handling for "payment thank you" type messages
  // These are often credit card payment confirmations
  if (/payment\s+(thank you|sent|received)/i.test(transactionName)) {
    // If it's from a credit card account, it's likely a payment TO the card (transfer)
    if (transaction.account.type === "credit") {
      const transferCategory = await prisma.category.findFirst({ where: { isTransfer: true } });
      if (transferCategory) {
        await applyCategory(transactionId, transferCategory.id, transaction.kindLocked);
        return transferCategory.name;
      }
    }
    // Otherwise, leave uncategorized for manual review
    return null;
  }

  // 1. What the user taught, matched on normalized merchant so one answer
  //    covers every charge from that shop. Their answer outranks everything.
  const learned = await findRuleFor(transactionName);
  if (learned) {
    await applyCategory(transactionId, learned.categoryId, transaction.kindLocked);
    return learned.category.name;
  }

  // 2. Built-in merchant rules: broad knowledge of well-known chains, useful
  //    before there's any history to learn from.
  const categories = await categoriesByName();
  for (const rule of CATEGORIZATION_RULES) {
    if (rule.pattern.test(transactionName)) {
      const category = categories.get(rule.category);
      if (category) {
        await applyCategory(transactionId, category.id, transaction.kindLocked);
        return category.name;
      }
    }
  }

  // 3. The model trained on the user's own categorizations. This is what
  //    stops an unknown merchant from sitting uncategorized forever just
  //    because nobody wrote a regex for it. Only applied when it's confident;
  //    anything shakier is offered on the teach screen instead of being
  //    written into the ledger behind the user's back.
  if (model) {
    const guess = predict(model, transactionName);
    if (guess && guess.confidence >= AUTO_APPLY_CONFIDENCE) {
      await applyCategory(transactionId, guess.categoryId, transaction.kindLocked);
      return guess.categoryName;
    }
  }

  return null;
}

// `since` bounds the work to transactions that arrived after that moment.
// A sync only needs to categorize what it just pulled in; re-reading and
// re-deciding the entire ledger on every sync is work that grows with history
// forever, for a result that can't change for rows nothing has touched.
// Called with no argument (the explicit "clean up" action) it still does
// everything, because that's what the user is asking for.
export async function autoCategorizeAll(since?: Date) {
  // Trained once per run, not per transaction — retraining inside the loop
  // would re-read the whole ledger for every row. Training always reads the
  // full history: the model is only as good as everything it has seen, even
  // when only a handful of new rows are being classified.
  const model = await trainModel();

  // Everything in scope, not just the uncategorized ones, so wrong categories
  // get fixed rather than frozen in place.
  const allTransactions = await prisma.transaction.findMany({
    where: since ? { createdAt: { gte: since } } : {},
    include: { category: true },
  });

  let categorized = 0;
  let recategorized = 0;

  for (const tx of allTransactions) {
    const oldCategory = tx.category?.name;
    const result = await autoCategorizeTransaction(tx.id, tx.name, model);

    if (result) {
      if (oldCategory && oldCategory !== result) {
        recategorized++;
      } else if (!oldCategory) {
        categorized++;
      }
    }
  }

  // Reported so "did it actually do everything?" has an answer. Transfers are
  // excluded from the denominator: they carry no category by design, so
  // counting them would cap coverage below 100% forever.
  const [remaining, categorizable] = await Promise.all([
    prisma.transaction.count({ where: { categoryId: null, kind: { not: "transfer" } } }),
    prisma.transaction.count({ where: { kind: { not: "transfer" } } }),
  ]);

  return {
    total: allTransactions.length,
    categorized,
    recategorized,
    processed: categorized + recategorized,
    remaining,
    coverage: categorizable > 0 ? (categorizable - remaining) / categorizable : 1,
    modelTrainedOn: model.totalDocs,
  };
}
