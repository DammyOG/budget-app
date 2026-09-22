const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export interface Account {
  id: string;
  plaidItemId: string | null;
  name: string;
  officialName: string | null;
  institutionName: string;
  type: string;
  subtype: string | null;
  mask: string | null;
  currentBalanceCents: number | null;
  availableBalanceCents: number | null;
  isoCurrencyCode: string | null;
  isManual: boolean;
  archivedAt: string | null;
  // Present only on Plaid-linked accounts (GET /accounts includes it via the
  // relation); absent on manual accounts, which have nothing to sync.
  plaidItem?: {
    institutionName: string | null;
    lastSyncedAt: string | null;
    needsReauth: boolean;
    lastSyncError: string | null;
  } | null;
}

export interface Category {
  id: string;
  name: string;
  icon: string | null;
  isIncome: boolean;
}

export type TransactionKind = "expense" | "income" | "transfer";

export interface Transaction {
  id: string;
  accountId: string;
  categoryId: string | null;
  amountCents: number;
  date: string;
  name: string;
  merchantName: string | null;
  pending: boolean;
  isManual: boolean;
  notes: string | null;
  kind: TransactionKind;
  kindLocked: boolean;
  transferPairId: string | null;
  account: { name: string; institutionName: string };
  category: Category | null;
  // Derived per-request by the list endpoint, not stored on the row.
  isDuplicate?: boolean;
  transferCounterpartAccount?: string | null;
}

export type TransactionSort = "date" | "amount" | "name";
export type SortDirection = "asc" | "desc";

export interface AttentionCounts {
  pending: number;
  uncategorized: number;
  duplicateGroups: number;
  total: number;
}

export interface TeachMerchant {
  merchantKey: string;
  sampleName: string;
  count: number;
  totalAmount: number;
  lastDate: string;
  accountName: string;
  transactionIds: string[];
  // What the model trained on your own answers thinks this is, if it has
  // enough history to have an opinion.
  guess: { categoryId: string; categoryName: string; confidence: number; reason: string } | null;
}

export interface TeachQueue {
  merchants: TeachMerchant[];
  uncategorizedTransactions: number;
  uncategorizedMerchants: number;
  coverage: number;
  modelTrainedOn: number;
}

export interface Budget {
  id: string;
  categoryId: string;
  month: string;
  amountCents: number;
  category: Category;
}

export interface DashboardSummary {
  month: string;
  netWorth: number;
  assets: number;
  liabilities: number;
  byType: Record<string, number>;
  income: number;
  spending: number;
  netCashFlow: number;
  spendingByCategory: { categoryId: string | null; name: string; total: number }[];
  budgetVsActual: { categoryId: string; categoryName: string; budgeted: number; spent: number }[];
}

export interface MonthTotals {
  month: string;
  income: number;
  expenses: number;
  net: number;
}

export interface IncomeSpendingSummary {
  startDate: string;
  endDate: string;
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  incomeByCategory: { categoryId: string | null; name: string; total: number }[];
  expensesByCategory: { categoryId: string | null; name: string; total: number }[];
  byMonth: MonthTotals[];
  // The equivalent stretch immediately before the selected one. byMonth only
  // covers the selected range, so on a single month it has one entry and can't
  // answer "how does this compare to last month" at all.
  previous: {
    startDate: string;
    endDate: string;
    totalIncome: number;
    totalExpenses: number;
    netIncome: number;
  };
  // Trailing 12 months regardless of the selected range, so the charts have
  // something to plot even when looking at one month.
  trend: MonthTotals[];
}

export interface UnmatchedFlow {
  id: string;
  name: string;
  amountCents: number;
  date: string;
  accountId: string;
  accountName: string;
  kind: TransactionKind;
}

export interface LinkedPair {
  outgoing: { id: string; name: string; amountCents: number; date: string; accountName: string } | null;
  incoming: { id: string; name: string; amountCents: number; date: string; accountName: string } | null;
  // A leg whose counterpart is gone: excluded from spending but with nothing
  // to collapse against, so it needs unlinking.
  broken: boolean;
}

export interface TransferPair {
  fromTransaction: {
    id: string;
    name: string;
    amountCents: number;
    date: Date;
    accountName: string;
  };
  toTransaction: {
    id: string;
    name: string;
    amountCents: number;
    date: Date;
    accountName: string;
  };
  confidence: "high" | "medium" | "low";
  reason: string;
}

export interface RecurringTransaction {
  name: string;
  merchantName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  frequency: "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
  averageAmount: number;
  count: number;
  lastDate: string;
  nextExpectedDate: string;
  transactions: {
    id: string;
    amountCents: number;
    date: string;
    accountName: string;
  }[];
}

export interface RecurringStats {
  total: number;
  monthlySubscriptions: number;
  totalMonthlyExpenses: number;
  totalRecurringMonthlyEquivalent: number;
}

export const api = {
  createLinkToken: () => request<{ linkToken: string }>("/plaid/create_link_token", { method: "POST" }),
  createUpdateLinkToken: (itemId: string) =>
    request<{ linkToken: string }>(`/plaid/create_update_link_token/${itemId}`, { method: "POST" }),
  exchangePublicToken: (publicToken: string) =>
    request<{ success: boolean; institutionName: string }>("/plaid/exchange_public_token", {
      method: "POST",
      body: JSON.stringify({ publicToken }),
    }),
  syncAll: () => request<{ results: any[] }>("/plaid/sync_all", { method: "POST" }),
  syncItem: (itemId: string) => request(`/plaid/sync/${itemId}`, { method: "POST" }),

  getAccounts: () => request<Account[]>("/accounts"),
  getArchivedAccounts: () => request<Account[]>("/accounts/archived"),
  addManualAccount: (data: Partial<Account>) =>
    request<Account>("/accounts/manual", { method: "POST", body: JSON.stringify(data) }),
  updateAccount: (id: string, data: Partial<Account>) =>
    request<Account>(`/accounts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteAccount: (id: string) => request(`/accounts/${id}`, { method: "DELETE" }),
  restoreAccount: (id: string) => request<Account>(`/accounts/${id}/restore`, { method: "POST" }),
  permanentlyDeleteAccount: (id: string) => request(`/accounts/${id}/permanent`, { method: "DELETE" }),

  getTransactions: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request<{ transactions: Transaction[]; total: number; hasMore: boolean; collapsed: boolean }>(
      `/transactions${qs ? `?${qs}` : ""}`
    );
  },
  getAttentionCounts: () => request<AttentionCounts>("/transactions/attention"),
  addManualTransaction: (data: Partial<Transaction>) =>
    request<Transaction>("/transactions/manual", { method: "POST", body: JSON.stringify(data) }),
  updateTransaction: (id: string, data: Partial<Transaction>) =>
    request<Transaction>(`/transactions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteTransaction: (id: string) => request(`/transactions/${id}`, { method: "DELETE" }),
  autoCategorizeAll: () =>
    request<{
      total: number;
      categorized: number;
      recategorized: number;
      processed: number;
      remaining: number;
      coverage: number;
      modelTrainedOn: number;
    }>("/transactions/auto-categorize", { method: "POST" }),
  categorizeAllSimilar: (transactionName: string, categoryId: string) =>
    request<{ count: number }>("/transactions/categorize-similar", {
      method: "POST",
      body: JSON.stringify({ transactionName, categoryId }),
    }),

  getTeachQueue: (limit = 10) => request<TeachQueue>(`/transactions/teach?limit=${limit}`),
  teachMerchant: (transactionName: string, categoryId: string) =>
    request<{ applied: number }>("/transactions/teach", {
      method: "POST",
      body: JSON.stringify({ transactionName, categoryId }),
    }),

  getCategories: () => request<Category[]>("/categories"),
  addCategory: (data: Partial<Category>) =>
    request<Category>("/categories", { method: "POST", body: JSON.stringify(data) }),
  deleteCategory: (id: string) => request(`/categories/${id}`, { method: "DELETE" }),

  getBudgets: (month: string) => request<Budget[]>(`/budgets?month=${month}`),
  setBudget: (categoryId: string, month: string, amountCents: number) =>
    request<Budget>("/budgets", { method: "PUT", body: JSON.stringify({ categoryId, month, amountCents }) }),
  deleteBudget: (id: string) => request(`/budgets/${id}`, { method: "DELETE" }),

  getDashboardSummary: (month: string) => request<DashboardSummary>(`/dashboard/summary?month=${month}`),
  getIncomeSpending: (params?: { startDate?: string; endDate?: string; groupBy?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<IncomeSpendingSummary>(`/dashboard/income-spending${qs ? `?${qs}` : ""}`);
  },

  detectTransfers: () => request<TransferPair[]>("/transfers/detect"),
  getUnmatchedFlows: () => request<{ outgoing: UnmatchedFlow[]; incoming: UnmatchedFlow[] }>("/transfers/unmatched"),
  getLinkedPairs: () => request<LinkedPair[]>("/transfers/linked"),
  linkTransferPair: (transaction1Id: string, transaction2Id: string) =>
    request<{ success: boolean }>("/transfers/link", {
      method: "POST",
      body: JSON.stringify({ transaction1Id, transaction2Id }),
    }),
  unlinkTransferPair: (transactionId: string) =>
    request<{ success: boolean }>("/transfers/unlink", {
      method: "POST",
      body: JSON.stringify({ transactionId }),
    }),
  autoLinkTransfers: () => request<{ total: number; linked: number; zelleFixed?: number }>("/transfers/auto-link", { method: "POST" }),

  getRecurringTransactions: () => request<RecurringTransaction[]>("/recurring"),
  getRecurringStats: () => request<RecurringStats>("/recurring/stats"),
};

// Takes cents, because that's what the API returns and what every amount in
// this app is. Naming the unit on the fields is what stops a dollar figure
// being passed here and rendering 100x too small.
export function formatCurrency(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

// The two edges where the user thinks in dollars: typing an amount, and
// reading one back into an input.
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

// Amounts are stored the way they read: negative is money out. A $50 coffee is
// -$50.00 and a paycheck is +$2,000.00, with no flip between storage and
// display — that flip is where most of this app's money bugs came from.
export function formatSignedAmount(amount: number): string {
  return formatCurrency(amount);
}

// Spending as a positive figure, for totals phrased as "you spent $310".
export function spendingAmount(amount: number): number {
  return -amount;
}

export function isOutflow(amount: number): boolean {
  return amount < 0;
}

// Dates are stored at UTC midnight. Rendering them in local time shows every
// transaction a day early for anyone west of UTC. Accepts Date as well as the
// string that actually arrives over JSON, since some API types declare Date.
export function formatTransactionDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-US", { timeZone: "UTC" });
}

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

// "Synced 2 hours ago" beats a raw timestamp for answering the question that
// actually matters here: is this data current enough to trust right now?
export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Never synced";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
