# Budget App - Income & Spending Tracking Implementation Analysis

## Overview
This is a personal finance dashboard built with React (frontend) and Node.js/Express (backend) using SQLite via Prisma ORM. It integrates with Plaid for real bank connections and supports manual account tracking.

---

## 1. PAGES & COMPONENTS FOR VIEWING TRANSACTIONS, SPENDING, AND INCOME

### Frontend Pages

#### Dashboard (`/client/src/pages/Dashboard.tsx`)
- **Location**: `/Users/dami/Desktop/projects/budget-app/client/src/pages/Dashboard.tsx`
- **Purpose**: Main overview page showing:
  - Net worth summary (assets - liabilities)
  - Assets breakdown
  - Liabilities breakdown
  - Spending by category (pie chart visualization with Recharts)
  - Budget vs. actual comparison with progress bars
- **Key Features**:
  - Month selector to view data for different months
  - Pie chart showing spending distribution
  - Budget tracking with visual indicators (red if over budget, green if under)
  - Shows categories sorted by spending amount

#### Transactions (`/client/src/pages/Transactions.tsx`)
- **Location**: `/Users/dami/Desktop/projects/budget-app/client/src/pages/Transactions.tsx`
- **Purpose**: List all transactions with:
  - Date, name, account, category, and amount columns
  - Transaction categorization interface (inline dropdown)
  - Pending transaction indicators
- **Key Features**:
  - Search by transaction name
  - Filter by account
  - Filter by category
  - Inline category editing
  - Amount display with color coding (positive = dark/expense, negative = green/income)

#### Budgets (`/client/src/pages/Budgets.tsx`)
- **Location**: `/Users/dami/Desktop/projects/budget-app/client/src/pages/Budgets.tsx`
- **Purpose**: Budget planning and tracking
  - Set/edit monthly budgets per category
  - View spent vs. budget for each category
  - Show remaining amount with color coding
- **Key Features**:
  - Month selector
  - Only shows non-income categories (filters with `.filter((c) => !c.isIncome)`)
  - Displays budget, spent, and remaining amounts
  - Clear/delete budget functionality

#### Accounts (`/client/src/pages/Accounts.tsx`)
- **Location**: `/Users/dami/Desktop/projects/budget-app/client/src/pages/Accounts.tsx`
- **Purpose**: Manage linked and manual accounts
  - Link accounts via Plaid
  - Add manual accounts
  - View account balances organized by institution
  - Sync accounts
- **Key Features**:
  - Plaid integration button
  - Manual account creation form
  - Shows account type, subtype, mask, balance
  - Remove/archive functionality
  - Distinguishes manual vs. linked accounts

### Backend Routes

#### Dashboard Summary (`/server/src/routes/dashboard.ts`)
- **Endpoint**: `GET /api/dashboard/summary?month=YYYY-MM`
- **Returns**:
  - Month
  - Net worth (assets - liabilities)
  - Assets total
  - Liabilities total
  - Balance by account type
  - Spending by category (only POSITIVE amounts)
  - Budget vs. actual comparison
- **Note**: Only includes transactions with `amount: { gt: 0 }` for spending calculations

#### Transactions (`/server/src/routes/transactions.ts`)
- **Endpoints**:
  - `GET /api/transactions` - List with filtering
  - `POST /api/transactions/manual` - Create manual transaction
  - `PATCH /api/transactions/:id` - Update transaction
  - `DELETE /api/transactions/:id` - Delete transaction
- **Filtering Capabilities**:
  - `accountId` - Filter by account
  - `categoryId` - Filter by category (or "uncategorized")
  - `search` - Text search on transaction name
  - `startDate`, `endDate` - Date range filtering
  - `limit` - Pagination (default 500)
- **Returns**: Includes related account and category data

---

## 2. TRANSACTION CATEGORIZATION (INCOME VS. EXPENSES)

### Category Model
```prisma
model Category {
  id           String   @id @default(cuid())
  name         String   @unique
  icon         String?
  isIncome     Boolean  @default(false)
  createdAt    DateTime @default(now())

  transactions Transaction[]
  budgets      Budget[]
}
```

### Default Categories (Seeded on startup)
The app seeds 17 default categories in `/server/src/index.ts`:

**Expense Categories**:
1. Groceries
2. Dining & Restaurants
3. Rent & Mortgage
4. Utilities
5. Transportation
6. Shopping
7. Entertainment
8. Health & Fitness
9. Travel
10. Subscriptions
11. Insurance
12. Personal Care
13. Education
14. Gifts & Donations
15. Fees & Charges
16. Transfer

**Income Category**:
17. Income (`isIncome: true`)

### Income Categorization
- Categories have an `isIncome` boolean flag
- Only the "Income" category is seeded with `isIncome: true`
- **Budgets page explicitly filters out income categories**: `.filter((c) => !c.isIncome)` - only shows expense categories for budget planning
- **Dashboard spending only counts positive amounts**: `amount: { gt: 0 }` - this means income (negative) is excluded from spending calculations

### Amount Convention (from Plaid)
- **Positive amounts** = Money OUT (expenses/charges)
- **Negative amounts** = Money IN (income/deposits/transfers received)
- This is the Plaid convention documented in the Transaction model comment

---

## 3. DATABASE SCHEMA FOR TRANSACTIONS AND CATEGORIES

### Transaction Model
```prisma
model Transaction {
  id                  String   @id @default(cuid())
  plaidTransactionId  String?  @unique
  accountId           String
  categoryId          String?
  amount              Float    // positive = out, negative = in (Plaid convention)
  date                DateTime
  name                String
  merchantName        String?
  pending             Boolean  @default(false)
  isManual            Boolean  @default(false)
  notes               String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  account  Account   @relation(fields: [accountId], references: [id], onDelete: Cascade)
  category Category? @relation(fields: [categoryId], references: [id])

  @@index([accountId])
  @@index([categoryId])
  @@index([date])
}
```

### Category Model (details)
```prisma
model Category {
  id           String   @id @default(cuid())
  name         String   @unique
  icon         String?
  isIncome     Boolean  @default(false)
  createdAt    DateTime @default(now())

  transactions Transaction[]
  budgets      Budget[]
}
```

### Account Model
```prisma
model Account {
  id               String   @id @default(cuid())
  plaidItemId      String?
  plaidAccountId   String?  @unique
  name             String
  officialName     String?
  institutionName  String
  type             String   // depository | credit | investment | loan | manual
  subtype          String?  // checking | savings | credit card | ira | brokerage ...
  mask             String?
  currentBalance   Float?
  availableBalance Float?
  isoCurrencyCode  String?  @default("USD")
  isManual         Boolean  @default(false)
  archivedAt       DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  plaidItem    PlaidItem?    @relation(fields: [plaidItemId], references: [id], onDelete: Cascade)
  transactions Transaction[]
}
```

### Budget Model
```prisma
model Budget {
  id         String   @id @default(cuid())
  categoryId String
  month      String   // "YYYY-MM"
  amount     Float
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  category Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@unique([categoryId, month])
}
```

### Key Database Characteristics
- **SQLite** (can be swapped for Postgres/MySQL via environment config)
- **Indexes on**: accountId, categoryId, date (for transaction queries)
- **Unique constraints**: plaidTransactionId, plaidAccountId, Category name
- **Cascading deletes**: Accounts → Transactions, PlaidItems → Accounts
- **Optional relationships**: categoryId can be null (uncategorized transactions)

---

## 4. EXISTING FILTERING CAPABILITIES

### Transactions Page
1. **Text Search**: Searches transaction name field
2. **Account Filter**: Dropdown to select single account or all
3. **Category Filter**: Dropdown with categories + "Uncategorized" option
4. **No date picker**: Filtering is done server-side but no UI for date range

### Backend Filtering (All via GET `/api/transactions`)
- `accountId` - exact match on account
- `categoryId` - exact match, special handling for "uncategorized" (converts to null)
- `search` - text contains match on name field
- `startDate` - date range start (GTE)
- `endDate` - date range end (LTE)
- `limit` - pagination (default 500)

### Dashboard Filtering
- **Monthly**: Select month via input[type="month"]
- **Fixed**: Only shows positive amounts (expenses), excludes income

### Budget Filtering
- **Monthly**: Select month
- **Category type**: Only shows non-income categories

---

## 5. EXISTING DASHBOARD & SUMMARY VIEWS

### Dashboard (`/pages/Dashboard.tsx`)
- **Net worth card**: Shows total assets - liabilities
- **Assets card**: Total of all non-liability accounts
- **Liabilities card**: Total of credit and loan accounts
- **Spending by category**: 
  - Pie chart visualization (using Recharts)
  - Legend showing breakdown by category with amounts
  - Sorted by amount (highest first)
  - Colors: 10-color palette cycling
- **Budget vs. actual**:
  - Shows budgeted vs. spent for each category with budget
  - Progress bars with visual overflow indicators
  - Red bar if over budget, indigo if under

### Account Type Classification for Net Worth
```typescript
const LIABILITY_TYPES = new Set(["credit", "loan"]);
// Accounts with type in this set are subtracted from net worth
// All other types (depository, investment, etc.) are added
```

### No Separate Income View
- Income transactions are **not displayed** on the dashboard
- Dashboard only shows `amount: { gt: 0 }` which filters out income
- Income is not included in spending calculations

---

## 6. ZELLE & TRANSFER TRANSACTION HANDLING

### Current Implementation
1. **"Transfer" is a seeded category** (same level as other expense categories)
2. **No special handling** for Zelle or inter-account transfers
3. **Treated as regular transactions** with amount and category fields
4. **Zelle limitation**: Plaid may not capture Zelle transactions in all banks' transaction feeds
   - Some banks only sync their own transfers
   - Zelle transfers between different banks may not be captured automatically

### Amount Convention
- Transfers OUT appear as **positive amounts** (money out)
- Transfers IN appear as **negative amounts** (money in)
- This matches the Plaid convention documented in schema

### Potential Issues
- No automatic detection of transfer vs. expense
- Users must manually categorize transfers (assign to "Transfer" category)
- No deduplication: if same transfer syncs from both accounts (sender and receiver), both appear in the database

---

## 7. KEY FILES SUMMARY

### Frontend
- **Pages**:
  - `/Users/dami/Desktop/projects/budget-app/client/src/pages/Dashboard.tsx`
  - `/Users/dami/Desktop/projects/budget-app/client/src/pages/Transactions.tsx`
  - `/Users/dami/Desktop/projects/budget-app/client/src/pages/Budgets.tsx`
  - `/Users/dami/Desktop/projects/budget-app/client/src/pages/Accounts.tsx`

- **Components**:
  - `/Users/dami/Desktop/projects/budget-app/client/src/components/PlaidLinkButton.tsx`

- **API Client**:
  - `/Users/dami/Desktop/projects/budget-app/client/src/lib/api.ts` - All API calls with TypeScript interfaces

- **Routing**:
  - `/Users/dami/Desktop/projects/budget-app/client/src/App.tsx` - Navigation structure

### Backend
- **Routes**:
  - `/Users/dami/Desktop/projects/budget-app/server/src/routes/transactions.ts`
  - `/Users/dami/Desktop/projects/budget-app/server/src/routes/categories.ts`
  - `/Users/dami/Desktop/projects/budget-app/server/src/routes/dashboard.ts`
  - `/Users/dami/Desktop/projects/budget-app/server/src/routes/budgets.ts`
  - `/Users/dami/Desktop/projects/budget-app/server/src/routes/accounts.ts`
  - `/Users/dami/Desktop/projects/budget-app/server/src/routes/plaid.ts`

- **Services**:
  - `/Users/dami/Desktop/projects/budget-app/server/src/services/syncTransactions.ts` - Cursor-based incremental sync
  - `/Users/dami/Desktop/projects/budget-app/server/src/services/syncAccounts.ts`

- **Core**:
  - `/Users/dami/Desktop/projects/budget-app/server/src/index.ts` - Server setup, category seeding
  - `/Users/dami/Desktop/projects/budget-app/server/src/db.ts` - Prisma client
  - `/Users/dami/Desktop/projects/budget-app/server/prisma/schema.prisma` - Data model

---

## 8. WHAT EXISTS vs. WHAT NEEDS TO BE BUILT

### WHAT EXISTS

#### Income Tracking
- **Income category** exists and is seeded by default
- **isIncome flag** on Category model to mark income categories
- **API support** for creating/assigning transactions to income categories
- **Transaction model** supports negative amounts (convention for income)

#### Spending Tracking
- **Dashboard** shows spending by category via pie chart
- **Transactions page** lists all transactions with filtering
- **Budgets page** shows budget vs. actual spending
- **Full filtering** on transactions (account, category, search, date range)
- **Monthly breakdown** on dashboard

#### Categories & Organization
- **17 default categories** seeded (includes Income and Transfer)
- **Create custom categories** via API
- **Assign to transactions** inline via UI
- **Filter by category** on transactions page

#### Account Management
- **Link accounts** via Plaid
- **Manual accounts** for self-tracking
- **Account types**: depository, credit, investment, loan, manual
- **Net worth calculation** (assets - liabilities by type)

#### Budgeting
- **Set monthly budgets** per category
- **View budget vs. actual** spending
- **Color-coded progress** (red over, green under)
- **Budget only for expenses** (filters income categories)

### WHAT NEEDS TO BE BUILT / GAPS

#### Income-Specific Features
1. **Income Dashboard View**: No dedicated page showing:
   - Total income for the month
   - Income by source/category
   - Income trend chart
   - Income summary card on dashboard

2. **Income Filtering**: 
   - Transactions page doesn't filter income separately
   - No way to view "only income" transactions from UI
   - Dashboard excludes income entirely

3. **Income Categorization**:
   - Only one "Income" category by default
   - Users need multiple income categories (Salary, Bonus, Side Gigs, etc.)
   - No seeding for these

4. **Income vs. Expense Reporting**:
   - Dashboard doesn't show net income/expenses
   - No income/expense comparison
   - No trend analysis

#### Transfer/Zelle Handling
1. **Transfer Detection**:
   - No automatic detection of transfers between accounts
   - No deduplication of same transfer appearing twice
   - Manual categorization required

2. **Transfer Filtering**:
   - Transfers counted as expenses in spending calculations
   - No separate "transfers" view
   - Can't exclude transfers from spending totals

#### Advanced Filtering
1. **Date Range UI**: Backend supports it, frontend doesn't expose it
2. **Pending Transactions**: UI shows indicator but no filter option
3. **Manual vs. Synced**: No filter to show only manual or synced transactions

#### Reporting
1. **Income Report**: No dedicated income summary page
2. **Export**: No CSV/PDF export
3. **Recurring Transactions**: Mentioned in README as future idea
4. **Trends**: No month-over-month comparison

---

## 9. RECOMMENDED ENHANCEMENTS

### Priority 1: Income Tracking
- Add income dashboard section showing:
  - Total monthly income by category
  - Income breakdown chart
  - Summary card with YTD income
  
- Create multiple income categories:
  - Salary
  - Bonus
  - Interest/Dividends
  - Side Income
  - Gifts
  - Refunds

- Add filtering on Transactions page for income-only view

### Priority 2: Transfer Handling
- Create "Transfer" subcategory system or tag
- Add logic to filter transfers from spending calculations
- Option to view/exclude transfers from dashboard

### Priority 3: Enhanced Filtering
- Add date range picker to frontend
- Add "only income" and "only expenses" filters
- Add pending transaction filter

### Priority 4: Reporting
- Dedicated Income page with:
  - Monthly income summary
  - Income by category breakdown
  - YTD income total
  - Income vs. last month comparison
