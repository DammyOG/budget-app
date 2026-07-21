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
