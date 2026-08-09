# Budget App

A personal finance dashboard for tracking spending, budgets, and net worth
across linked bank, credit, brokerage, and retirement accounts.

Built for linking:
- Bank of America (checking + credit)
- Chase (credit)
- Capital One (savings)
- Ally (savings)
- Robinhood (investment)
- Roth IRA

## Stack

- **Backend**: Node.js, Express, TypeScript, Prisma ORM, SQLite, [Plaid](https://plaid.com) for bank linking
- **Frontend**: React, Vite, TypeScript, Tailwind CSS, Recharts

## How account linking works

Real bank connections go through **Plaid**, the aggregator that most budgeting
apps (Mint, YNAB, Copilot, etc.) use under the hood — it's what lets you type
your bank login into a Plaid Link popup and get back accounts + transactions
without this app ever seeing your bank password.

1. Sign up for a free developer account at https://dashboard.plaid.com/signup
2. Grab your `client_id` and `sandbox` secret from the Plaid dashboard
3. Drop them into `server/.env` (see setup below)

**Sandbox mode** (the default) lets you fully test the whole flow today using
Plaid's fake test institutions and a fake login (`user_good` / `pass_good`) —
no real bank credentials involved.

**Production mode** (real Bank of America, Chase, Capital One, Ally,
Robinhood logins) requires applying for Plaid production access — free for
personal-scale use, but it's a manual approval step on Plaid's side. Once
approved, switch `PLAID_ENV=production` in `server/.env` and use your
production keys instead of sandbox keys. No app code changes needed.

Accounts that aren't supported by Plaid, or that you'd rather not link
automatically, can be added as **manual accounts** and updated by hand.

## Project layout

```
server/   Express API, Prisma schema, Plaid integration
client/   React frontend (Vite)
```

## Setup

### 1. Backend

```bash
cd server
npm install
cp .env.example .env
```

Edit `server/.env`:
- `PLAID_CLIENT_ID`, `PLAID_SECRET` — from the Plaid dashboard
- `ENCRYPTION_KEY` — generate with:
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  (used to encrypt Plaid access tokens at rest in the local database)

Then set up the database and start the server:

```bash
npx prisma migrate dev --name init
npm run dev
```

The API runs at http://localhost:4000.

### 2. Frontend

```bash
cd client
npm install
npm run dev
```

The app runs at http://localhost:5173 (proxies `/api` to the backend).

## Features

- **Link accounts** via Plaid Link, or add accounts manually
- **Auto-sync** balances and transactions (cursor-based incremental sync)
- **Net worth** tracking (assets − liabilities, across all account types)
- **Transactions** list with search, filter by account/category, and
  category editing
- **Categories & budgets** — set a monthly budget per category, see spend
  vs. budget with progress bars
- **Dashboard** with spending-by-category breakdown and budget tracking

## How money movement is classified

Every transaction carries a **kind** in addition to its category, because not
all money movement is spending:

| Kind | Meaning | Counted in |
|---|---|---|
| `expense` | Money leaving your net worth | Spending |
| `income` | Money entering your net worth | Income |
| `transfer` | Money moving between your own accounts | Neither |

Without that distinction a Zelle from BofA checking to Chase reads as $500 of
"spending" even though you still have the money, moving cash into Ally savings
looks like spending rather than saving, and — worst — **a credit card payment
gets counted twice**: once when it leaves checking, and again as the purchases
on the card it paid off.

Transfers are paired by `transferPairId` and both legs are excluded from income
and spending. Detection is automatic (matching amount, opposite direction,
different accounts, within 3 days) with a review page at **Transfers**. Nothing
is final: the **Type** dropdown on any transaction overrides the classification,
and a manual choice is pinned so later syncs and re-categorization won't undo it.

Breaking a pair reclassifies each leg by its own direction — the outflow becomes
spending, the inflow becomes income.

### Zelle, specifically

Zelle is ambiguous, so it isn't classified by name alone:

- **To your own account at another bank** → paired as a transfer, excluded from
  spending.
- **To a person** (rent, splitting dinner) → real spending; categorize normally.
- **From a person** → income, unless it pairs with one of your own accounts.

### Refunds

A refund is a negative expense in the category it came from, so a $40 Amazon
return drops Shopping from $200 to $160 rather than adding $40 of "income".

## Verifying the money model

The classification logic has an end-to-end test that runs against the API and
needs no Plaid connectivity. With the server running:

```bash
cd server
npm run verify:money-model
```

It creates temporary accounts, simulates a Zelle pair, a credit card payment, a
paycheck and a refund, asserts that `/dashboard/summary` and
`/dashboard/income-spending` agree, checks that overrides survive
re-categorization, then cleans up after itself.

## Notes on security

- Plaid access tokens are encrypted at rest (AES-256-GCM) using
  `ENCRYPTION_KEY`, never stored in plaintext.
- This app is designed for **single-user, self-hosted** use (e.g. running
  locally or on your own server) — there's no multi-user auth layer.
- SQLite is used for simplicity; swap `DATABASE_URL` in `.env` and the
  Prisma `datasource` provider for Postgres/MySQL if you want to deploy it
  somewhere more durable.

## Future ideas

- Investment holdings detail (Plaid `/investments/holdings/get`) beyond
  just account balance
- Recurring transaction / subscription detection
- Multi-user auth if you want to share this with family
