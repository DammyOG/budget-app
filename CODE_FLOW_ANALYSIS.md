# Budget App - Code Flow Analysis for Income & Expense Handling

## Transaction Amount Convention

### Plaid Convention (From Comments in Schema)
```typescript
// From /server/prisma/schema.prisma
amount Float    // positive = money out, negative = money in (Plaid convention)
```

This convention is also evident in how Transactions are displayed:

```typescript
// From /client/src/pages/Transactions.tsx
<td className={`px-4 py-2 text-right font-medium ${tx.amount > 0 ? "text-slate-900" : "text-emerald-600"}`}>
  {formatCurrency(tx.amount)}
</td>
```

**Color Coding:**
- `tx.amount > 0` → dark text (expenses shown normally)
- `tx.amount < 0` → green text (income highlighted)

---

## Income Categorization Flow

### 1. Category Creation (Backend)

**Location:** `/server/src/routes/categories.ts`

```typescript
router.post("/", async (req, res) => {
  const { name, icon, isIncome } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  const category = await prisma.category.create({
    data: { name, icon: icon || null, isIncome: !!isIncome },
  });
  res.json(category);
});
```

**How it works:**
- Accepts `isIncome` boolean in request body
- Stores it in database
- Used to filter categories in UI

### 2. Default Category Seeding

**Location:** `/server/src/index.ts`

```typescript
const DEFAULT_CATEGORIES = [
  "Groceries",
  "Dining & Restaurants",
  "Rent & Mortgage",
  "Utilities",
  "Transportation",
  "Shopping",
  "Entertainment",
  "Health & Fitness",
  "Travel",
  "Subscriptions",
  "Insurance",
  "Personal Care",
  "Education",
  "Gifts & Donations",
  "Fees & Charges",
  "Transfer",
  "Income",
];

async function seedCategories() {
  for (const name of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { name },
      create: { name, isIncome: name === "Income" },  // <-- Only Income gets isIncome=true
      update: {},
    });
  }
}
```

**Key Point:** Only the "Income" category is marked with `isIncome: true`. This means:
- "Income" category is identified as income-related
- All other categories (including "Transfer") are treated as expenses
- User cannot budget for the "Income" category (it's filtered out)

### 3. Budget Filtering (Frontend)

**Location:** `/client/src/pages/Budgets.tsx`

```typescript
{categories
  .filter((c) => !c.isIncome)  // <-- Exclude income categories
  .map((c) => {
    const spent = spentFor(c.id);
    const budgeted = Number(drafts[c.id] || 0);
    const remaining = budgeted - spent;
    return (
      <tr key={c.id}>
        {/* Budget row for this category */}
      </tr>
    );
  })}
```

**Effect:**
- Income category never appears on budgets page
- Users cannot set a "budget" for income
- Only expense categories show budget vs. actual

---

## Spending Calculation Flow

### Dashboard Summary Endpoint

**Location:** `/server/src/routes/dashboard.ts`

```typescript
router.get("/summary", async (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const [year, mon] = month.split("-").map(Number);
  const startDate = new Date(Date.UTC(year, mon - 1, 1));
  const endDate = new Date(Date.UTC(year, mon, 1));

  // ... account totals for net worth ...

  // KEY FILTERING FOR SPENDING
  const transactions = await prisma.transaction.findMany({
    where: { 
      date: { gte: startDate, lt: endDate }, 
      amount: { gt: 0 }  // <-- ONLY POSITIVE AMOUNTS
    },
    include: { category: true },
  });

  const spendingByCategory: Record<string, { categoryId: string | null; name: string; total: number }> = {};
  for (const tx of transactions) {
    const key = tx.categoryId || "uncategorized";
    const name = tx.category?.name || "Uncategorized";
    if (!spendingByCategory[key]) spendingByCategory[key] = { categoryId: tx.categoryId, name, total: 0 };
    spendingByCategory[key].total += tx.amount;
  }

  const budgets = await prisma.budget.findMany({ where: { month }, include: { category: true } });
  const budgetVsActual = budgets.map((b) => ({
    categoryId: b.categoryId,
    categoryName: b.category.name,
    budgeted: b.amount,
    spent: spendingByCategory[b.categoryId]?.total || 0,
  }));

  res.json({
    month,
    netWorth: assets - liabilities,
    assets,
    liabilities,
    byType,
    spendingByCategory: Object.values(spendingByCategory).sort((a, b) => b.total - a.total),
    budgetVsActual,
  });
});
```

**Critical Filter:** `amount: { gt: 0 }`

This means:
- ✓ Includes positive amounts (expenses/charges)
- ✗ EXCLUDES negative amounts (income/deposits)
- Result: Dashboard only shows expenses, never shows income

**Impact on UI:**
```typescript
// Dashboard shows spendingByCategory (which has no income)
{summary.spendingByCategory.map((c, i) => (
  <li key={c.categoryId ?? "uncategorized"}>
    <span>{c.name}</span>
    <span className="font-medium">{formatCurrency(c.total)}</span>
  </li>
))}
```

---

## Transaction Filtering Flow

### Backend Filtering Logic

**Location:** `/server/src/routes/transactions.ts`

```typescript
router.get("/", async (req, res) => {
  const { accountId, categoryId, search, startDate, endDate, limit } = req.query;

  const where: any = {};
  if (accountId) where.accountId = String(accountId);
  
  // Special handling: "uncategorized" becomes categoryId: null
  if (categoryId) where.categoryId = categoryId === "uncategorized" ? null : String(categoryId);
  
  if (search) where.name = { contains: String(search) };
  
  if (startDate || endDate) {
    where.date = {};
    if (startDate) where.date.gte = new Date(String(startDate));
    if (endDate) where.date.lte = new Date(String(endDate));
  }

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { date: "desc" },
    take: limit ? Number(limit) : 500,
    include: { account: { select: { name: true, institutionName: true } }, category: true },
  });
  res.json(transactions);
});
```

**Available Filters (Backend):**
- ✓ accountId
- ✓ categoryId (with special "uncategorized" handling)
- ✓ search (text contains in name)
- ✓ startDate, endDate (date range)
- ✓ limit (pagination)

**NOT Available:**
- ✗ amount > 0 filter (to show only expenses)
- ✗ amount < 0 filter (to show only income)
- ✗ isIncome filter (to filter by category type)

### Frontend Filtering UI

**Location:** `/client/src/pages/Transactions.tsx`

```typescript
const [transactions, setTransactions] = useState<Transaction[]>([]);
const [accountId, setAccountId] = useState("");
const [categoryId, setCategoryId] = useState("");
const [search, setSearch] = useState("");

const load = () => {
  const params: Record<string, string> = {};
  if (accountId) params.accountId = accountId;
  if (categoryId) params.categoryId = categoryId;
  if (search) params.search = search;
  api.getTransactions(params).then(setTransactions).catch((err) => setError(err.message));
};

// Dropdowns in UI:
<select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
  <option value="">All categories</option>
  <option value="uncategorized">Uncategorized</option>
  {categories.map((c) => (
    <option key={c.id} value={c.id}>
      {c.name}
    </option>
  ))}
</select>
```

**Provided Filters:**
- ✓ Text search
- ✓ Account dropdown
- ✓ Category dropdown

**Missing Filters:**
- ✗ Income/expense toggle
- ✗ Date range (UI - backend supports it)
- ✗ Pending transactions filter

---

## Transfer & Zelle Handling

### Transfer Category

**Seeded as:** Just another expense category (line 29 in DEFAULT_CATEGORIES)

```typescript
const DEFAULT_CATEGORIES = [
  // ... others ...
  "Transfer",  // <-- treated like any expense
  "Income",
];
```

**No Special Handling:**
- No automatic detection if transaction is a transfer
- No marking or tagging system
- User must manually assign "Transfer" category
- Transfers are counted in spending calculations (since `amount: { gt: 0 }` includes them)

### Why Zelle May Not Work

**Plaid Limitation:**
- Plaid's transaction sync may not capture Zelle transactions for all banks
- Some banks only sync their own internal transfers
- Zelle transfers between different banks may not appear in feeds

**Code Location:** `/server/src/services/syncTransactions.ts`

```typescript
// Uses Plaid's cursor-based /transactions/sync
export async function syncTransactionsForItem(plaidItemDbId: string) {
  const item = await prisma.plaidItem.findUniqueOrThrow({ where: { id: plaidItemDbId } });
  const accessToken = decrypt(item.accessTokenEnc);

  let cursor = item.transactionsCursor ?? undefined;
  
  while (hasMore) {
    const { data } = await plaidClient.transactionsSync({
      access_token: accessToken,
      cursor,
    });

    for (const tx of data.added) {
      // Creates transaction record from Plaid data
      await prisma.transaction.upsert({
        where: { plaidTransactionId: tx.transaction_id },
        create: {
          plaidTransactionId: tx.transaction_id,
          accountId: account.id,
          amount: tx.amount,  // <-- Direct from Plaid
          date: new Date(tx.date),
          name: tx.name,
          merchantName: tx.merchant_name ?? null,
          pending: tx.pending,
        },
        // ...
      });
    }
  }
}
```

**What Happens:**
- Plaid returns transactions (or doesn't if Zelle not supported)
- App stores them as-is with Plaid's amount convention
- No deduplication if same transfer appears in both accounts

---

## API Client Interface

**Location:** `/client/src/lib/api.ts`

```typescript
export interface Transaction {
  id: string;
  accountId: string;
  categoryId: string | null;
  amount: number;
  date: string;
  name: string;
  merchantName: string | null;
  pending: boolean;
  isManual: boolean;
  notes: string | null;
  account: { name: string; institutionName: string };
  category: Category | null;
}

export interface Category {
  id: string;
  name: string;
  icon: string | null;
  isIncome: boolean;
}

export interface DashboardSummary {
  month: string;
  netWorth: number;
  assets: number;
  liabilities: number;
  byType: Record<string, number>;
  spendingByCategory: { categoryId: string | null; name: string; total: number }[];
  budgetVsActual: { categoryId: string; categoryName: string; budgeted: number; spent: number }[];
}
```

**Key Types:**
- `Category.isIncome` - boolean flag
- `Transaction.amount` - positive (out) or negative (in)
- `DashboardSummary` - only has spending, no income field

---

## Summary of Data Flow

### Expense/Spending Flow
```
Plaid Bank API
    ↓
syncTransactionsForItem() 
    ↓
Transaction record (amount > 0)
    ↓
Dashboard endpoint filters: amount > 0
    ↓
spendingByCategory array
    ↓
Dashboard pie chart + Budget comparison
```

### Income Flow
```
Plaid Bank API
    ↓
syncTransactionsForItem()
    ↓
Transaction record (amount < 0)
    ↓
Dashboard endpoint filters: amount > 0
    ↓
[FILTERED OUT - NOT SHOWN]
```

### Category Income Flag Flow
```
Default categories seeded with isIncome=true only for "Income"
    ↓
Budget page: .filter((c) => !c.isIncome)
    ↓
Income category excluded from budget UI
    ↓
User cannot set budget for income
```

---

## What's Missing

### Income Display Pipeline
- ✗ Endpoint: `GET /api/income/summary` (doesn't exist)
- ✗ Endpoint: `GET /api/income/by-category` (doesn't exist)
- ✗ Frontend: Income Dashboard section
- ✗ Frontend: Income filter on Transactions page
- ✗ Frontend: Income summary card

### Transfer Detection Pipeline
- ✗ Plaid may not provide Zelle data
- ✗ No automatic transfer detection logic
- ✗ No deduplication for same transfer in two accounts
- ✗ Transfers included in spending totals

### Advanced Filtering Pipeline
- ✗ Amount sign filter (expenses vs. income)
- ✗ Category type filter (isIncome flag not used in Transactions endpoint)
- ✗ Date range UI (backend ready, just needs UI)
