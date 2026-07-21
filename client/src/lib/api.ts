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
}

export interface Category {
  id: string;
  name: string;
  icon: string | null;
  isIncome: boolean;
}

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
  spendingByCategory: { categoryId: string | null; name: string; total: number }[];
  budgetVsActual: { categoryId: string; categoryName: string; budgeted: number; spent: number }[];
}

export const api = {
  createLinkToken: () => request<{ linkToken: string }>("/plaid/create_link_token", { method: "POST" }),
  exchangePublicToken: (publicToken: string) =>
    request<{ success: boolean; institutionName: string }>("/plaid/exchange_public_token", {
      method: "POST",
      body: JSON.stringify({ publicToken }),
    }),
  syncAll: () => request<{ results: any[] }>("/plaid/sync_all", { method: "POST" }),
  syncItem: (itemId: string) => request(`/plaid/sync/${itemId}`, { method: "POST" }),

  getAccounts: () => request<Account[]>("/accounts"),
  addManualAccount: (data: Partial<Account>) =>
    request<Account>("/accounts/manual", { method: "POST", body: JSON.stringify(data) }),
  updateAccount: (id: string, data: Partial<Account>) =>
    request<Account>(`/accounts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteAccount: (id: string) => request(`/accounts/${id}`, { method: "DELETE" }),

  getTransactions: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request<Transaction[]>(`/transactions${qs ? `?${qs}` : ""}`);
  },
  addManualTransaction: (data: Partial<Transaction>) =>
    request<Transaction>("/transactions/manual", { method: "POST", body: JSON.stringify(data) }),
  updateTransaction: (id: string, data: Partial<Transaction>) =>
    request<Transaction>(`/transactions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteTransaction: (id: string) => request(`/transactions/${id}`, { method: "DELETE" }),

  getCategories: () => request<Category[]>("/categories"),
  addCategory: (data: Partial<Category>) =>
    request<Category>("/categories", { method: "POST", body: JSON.stringify(data) }),
  deleteCategory: (id: string) => request(`/categories/${id}`, { method: "DELETE" }),

  getBudgets: (month: string) => request<Budget[]>(`/budgets?month=${month}`),
  setBudget: (categoryId: string, month: string, amount: number) =>
    request<Budget>("/budgets", { method: "PUT", body: JSON.stringify({ categoryId, month, amount }) }),
  deleteBudget: (id: string) => request(`/budgets/${id}`, { method: "DELETE" }),

  getDashboardSummary: (month: string) => request<DashboardSummary>(`/dashboard/summary?month=${month}`),
};

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
