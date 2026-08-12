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
  currentBalance: number | null;
  availableBalance: number | null;
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
  amount: number;
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
}

export interface Budget {
  id: string;
  categoryId: string;
  month: string;
  amount: number;
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

export interface IncomeSpendingSummary {
  startDate: string;
  endDate: string;
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  incomeByCategory: { categoryId: string | null; name: string; total: number }[];
  expensesByCategory: { categoryId: string | null; name: string; total: number }[];
  byMonth: { month: string; income: number; expenses: number; net: number }[];
}

export interface TransferPair {
  fromTransaction: {
    id: string;
    name: string;
    amount: number;
    date: Date;
    accountName: string;
  };
  toTransaction: {
    id: string;
    name: string;
    amount: number;
    date: Date;
    accountName: string;
  };
  confidence: "high" | "medium" | "low";
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
    amount: number;
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
    return request<{ transactions: Transaction[]; total: number; hasMore: boolean }>(
      `/transactions${qs ? `?${qs}` : ""}`
    );
  },
  addManualTransaction: (data: Partial<Transaction>) =>
    request<Transaction>("/transactions/manual", { method: "POST", body: JSON.stringify(data) }),
  updateTransaction: (id: string, data: Partial<Transaction>) =>
    request<Transaction>(`/transactions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteTransaction: (id: string) => request(`/transactions/${id}`, { method: "DELETE" }),
  autoCategorizeAll: () => request<{ total: number; categorized: number; recategorized: number; processed: number }>("/transactions/auto-categorize", { method: "POST" }),
  categorizeAllSimilar: (transactionName: string, categoryId: string) =>
    request<{ count: number }>("/transactions/categorize-similar", {
      method: "POST",
      body: JSON.stringify({ transactionName, categoryId }),
    }),

  getCategories: () => request<Category[]>("/categories"),
  addCategory: (data: Partial<Category>) =>
    request<Category>("/categories", { method: "POST", body: JSON.stringify(data) }),
  deleteCategory: (id: string) => request(`/categories/${id}`, { method: "DELETE" }),

  getBudgets: (month: string) => request<Budget[]>(`/budgets?month=${month}`),
  setBudget: (categoryId: string, month: string, amount: number) =>
    request<Budget>("/budgets", { method: "PUT", body: JSON.stringify({ categoryId, month, amount }) }),
  deleteBudget: (id: string) => request(`/budgets/${id}`, { method: "DELETE" }),

  getDashboardSummary: (month: string) => request<DashboardSummary>(`/dashboard/summary?month=${month}`),
  getIncomeSpending: (params?: { startDate?: string; endDate?: string; groupBy?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<IncomeSpendingSummary>(`/dashboard/income-spending${qs ? `?${qs}` : ""}`);
  },

  detectTransfers: () => request<TransferPair[]>("/transfers/detect"),
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

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

// Plaid signs money-out positive, which reads backwards from every finance app.
// Flip it for display so a $50 coffee shows as -$50.00 and a paycheck as
// +$2,000.00.
export function formatSignedAmount(amount: number): string {
  return formatCurrency(-amount);
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
