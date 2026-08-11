import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Account,
  api,
  Category,
  formatSignedAmount,
  formatTransactionDate,
  Transaction,
  TransactionKind,
} from "../lib/api";
import TransactionDetailModal from "../components/TransactionDetailModal";

interface Filters {
  accountId: string;
  categoryId: string;
  kind: TransactionKind | "";
  startDate: string;
  endDate: string;
  minAmount: string;
  maxAmount: string;
  pendingOnly: boolean;
}

const EMPTY_FILTERS: Filters = {
  accountId: "",
  categoryId: "",
  kind: "",
  startDate: "",
  endDate: "",
  minAmount: "",
  maxAmount: "",
  pendingOnly: false,
};

const KIND_LABELS: Record<TransactionKind, string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
};

function countActive(f: Filters): number {
  return Object.entries(f).filter(([, v]) => v !== "" && v !== false).length;
}

// "Today" / "Yesterday" / a full date — makes a long, Plaid-synced list
// scannable instead of just a wall of rows.
function dateGroupLabel(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00Z");
  const today = new Date();
  const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const diffDays = Math.round((todayUTC - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

function TransactionRow({ tx, onOpen }: { tx: Transaction; onOpen: () => void }) {
  const isTransfer = tx.kind === "transfer";
  return (
    <button
      onClick={onOpen}
      className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 active:bg-slate-100"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900 truncate">{tx.name}</span>
          {isTransfer && (
            <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
              ⇄
            </span>
          )}
          {tx.pending && <span className="shrink-0 text-xs text-amber-600">pending</span>}
        </div>
        <div className="text-sm text-slate-500 truncate">
          {tx.account?.name}
          {!isTransfer && ` · ${tx.category?.name || "Uncategorized"}`}
        </div>
      </div>
      <div
        className={`shrink-0 font-semibold ${
          isTransfer ? "text-slate-400" : tx.amount > 0 ? "text-slate-900" : "text-emerald-600"
        }`}
      >
        {formatSignedAmount(tx.amount)}
      </div>
    </button>
  );
}

function FilterSheet({
  filters,
  onChange,
  onClose,
  accounts,
  categories,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  onClose: () => void;
  accounts: Account[];
  categories: Category[];
}) {
  const [draft, setDraft] = useState(filters);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-md sm:rounded-lg rounded-t-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white">
          <h2 className="font-semibold text-lg">Filters</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">
            ×
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Account</label>
            <select
              value={draft.accountId}
              onChange={(e) => setDraft({ ...draft, accountId: e.target.value })}
              className="w-full rounded border px-3 py-2 text-sm"
            >
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.institutionName} · {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
            <select
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value as TransactionKind | "" })}
              className="w-full rounded border px-3 py-2 text-sm"
            >
              <option value="">All types</option>
              {(Object.keys(KIND_LABELS) as TransactionKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
            <select
              value={draft.categoryId}
              onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
              className="w-full rounded border px-3 py-2 text-sm"
            >
              <option value="">All categories</option>
              <option value="uncategorized">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Date range</label>
            <div className="flex gap-2 items-center">
              <input
                type="date"
                value={draft.startDate}
                onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
                className="w-full rounded border px-2 py-2 text-sm"
              />
              <span className="text-slate-400 text-sm">to</span>
              <input
                type="date"
                value={draft.endDate}
                onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
                className="w-full rounded border px-2 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Amount range</label>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                placeholder="Min"
                value={draft.minAmount}
                onChange={(e) => setDraft({ ...draft, minAmount: e.target.value })}
                className="w-full rounded border px-2 py-2 text-sm"
              />
              <span className="text-slate-400 text-sm">to</span>
              <input
                type="number"
                placeholder="Max"
                value={draft.maxAmount}
                onChange={(e) => setDraft({ ...draft, maxAmount: e.target.value })}
                className="w-full rounded border px-2 py-2 text-sm"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={draft.pendingOnly}
              onChange={(e) => setDraft({ ...draft, pendingOnly: e.target.checked })}
            />
            Pending only
          </label>
        </div>

        <div className="p-4 border-t flex gap-2 sticky bottom-0 bg-white">
          <button
            onClick={() => {
              setDraft(EMPTY_FILTERS);
              onChange(EMPTY_FILTERS);
            }}
            className="px-4 py-2 text-sm rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            Clear all
          </button>
          <button
            onClick={() => {
              onChange(draft);
              onClose();
            }}
            className="flex-1 px-4 py-2 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-500"
          >
            Apply filters
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Transactions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>({
    ...EMPTY_FILTERS,
    // The Dashboard's budget-vs-actual and category tiles link here with a
    // pre-set category, so a direct link lands already filtered.
    categoryId: searchParams.get("categoryId") || "",
  });
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [lastCategorized, setLastCategorized] = useState<{
    name: string;
    categoryId: string;
    categoryName: string;
  } | null>(null);

  const load = () => {
    const params: Record<string, string> = {};
    if (filters.accountId) params.accountId = filters.accountId;
    if (filters.categoryId) params.categoryId = filters.categoryId;
    if (filters.kind) params.kind = filters.kind;
    if (filters.startDate) params.startDate = filters.startDate;
    if (filters.endDate) params.endDate = filters.endDate;

    api
      .getTransactions(params)
      .then(setTransactions)
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    api.getAccounts().then(setAccounts).catch((err) => setError(err.message));
    api.getCategories().then(setCategories).catch((err) => setError(err.message));
  }, []);

  useEffect(load, [filters]);

  // Search and amount range are cheap enough to apply client-side against
  // the already-fetched page, so typing doesn't round-trip to the server.
  const visible = useMemo(() => {
    let rows = transactions;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((t) => t.name.toLowerCase().includes(q));
    }
    if (filters.minAmount) {
      const min = Number(filters.minAmount);
      rows = rows.filter((t) => Math.abs(t.amount) >= min);
    }
    if (filters.maxAmount) {
      const max = Number(filters.maxAmount);
      rows = rows.filter((t) => Math.abs(t.amount) <= max);
    }
    if (filters.pendingOnly) rows = rows.filter((t) => t.pending);
    return rows;
  }, [transactions, search, filters.minAmount, filters.maxAmount, filters.pendingOnly]);

  const groups = useMemo(() => {
    const byDate: Record<string, Transaction[]> = {};
    for (const tx of visible) {
      const key = tx.date.slice(0, 10);
      (byDate[key] ||= []).push(tx);
    }
    return Object.entries(byDate).sort(([a], [b]) => b.localeCompare(a));
  }, [visible]);

  const activeFilterCount = countActive(filters);

  const handleUpdate = () => {
    setSelectedTransaction(null);
    load();
  };

  // Offers to apply a freshly-picked category to every transaction sharing
  // that name — Plaid's sync tends to reuse the exact same merchant string,
  // so this clears out a batch in one click.
  const handleCategorized = (categoryId: string) => {
    if (!selectedTransaction) return;
    const category = categories.find((c) => c.id === categoryId);
    setLastCategorized({
      name: selectedTransaction.name,
      categoryId,
      categoryName: category?.name || "Unknown",
    });
  };

  const categorizeAllSimilar = async () => {
    if (!lastCategorized) return;
    setProcessing(true);
    try {
      const result = await api.categorizeAllSimilar(lastCategorized.name, lastCategorized.categoryId);
      setLastCategorized(null);
      load();
      alert(`Categorized ${result.count} similar transaction${result.count !== 1 ? "s" : ""}.`);
    } catch (err: any) {
      alert(`Failed: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const autoCategorize = async () => {
    setProcessing(true);
    try {
      const result = await api.autoCategorizeAll();
      alert(
        `Auto-categorization complete.\nNewly categorized: ${result.categorized}\nRe-categorized: ${result.recategorized}`
      );
      load();
    } catch (err: any) {
      alert(`Failed: ${err.message}`);
    } finally {
      setProcessing(false);
      setShowMaintenance(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <div className="relative">
          <button
            onClick={() => setShowMaintenance(!showMaintenance)}
            className="rounded-md border border-slate-300 p-2 text-slate-500 hover:bg-slate-100"
            title="More actions"
          >
            ⋯
          </button>
          {showMaintenance && (
            <div className="absolute right-0 mt-1 w-56 rounded-md border bg-white shadow-lg z-10 text-sm">
              <button
                onClick={autoCategorize}
                disabled={processing}
                className="w-full text-left px-4 py-2 hover:bg-slate-50 disabled:opacity-50"
              >
                {processing ? "Processing…" : "Re-run auto-categorization"}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <input
          placeholder="Search transactions…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded border px-3 py-2 text-sm"
        />
        <button
          onClick={() => setShowFilterSheet(true)}
          className={`rounded border px-4 py-2 text-sm whitespace-nowrap ${
            activeFilterCount > 0
              ? "border-indigo-300 bg-indigo-50 text-indigo-700"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </button>
      </div>

      {lastCategorized && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 flex items-center justify-between gap-3 text-sm">
          <p className="text-indigo-900">
            Categorize every other "{lastCategorized.name}" as {lastCategorized.categoryName}?
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={categorizeAllSimilar}
              disabled={processing}
              className="px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              Yes
            </button>
            <button onClick={() => setLastCategorized(null)} className="px-3 py-1 rounded text-indigo-700 hover:bg-indigo-100">
              No
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-lg border bg-white overflow-hidden">
        {groups.length === 0 ? (
          <p className="px-4 py-10 text-center text-slate-500 text-sm">
            {transactions.length === 0
              ? "No transactions yet. Link an account and sync to pull in history."
              : "Nothing matches your search or filters."}
          </p>
        ) : (
          groups.map(([date, rows]) => (
            <div key={date}>
              <div className="sticky top-0 bg-slate-50 px-4 py-1.5 text-xs font-medium text-slate-500 border-b">
                {dateGroupLabel(date)}
              </div>
              <div className="divide-y">
                {rows.map((tx) => (
                  <TransactionRow key={tx.id} tx={tx} onOpen={() => setSelectedTransaction(tx)} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {showFilterSheet && (
        <FilterSheet
          filters={filters}
          onChange={setFilters}
          onClose={() => setShowFilterSheet(false)}
          accounts={accounts}
          categories={categories}
        />
      )}

      {selectedTransaction && (
        <TransactionDetailModal
          transaction={selectedTransaction}
          categories={categories}
          onClose={() => setSelectedTransaction(null)}
          onUpdate={handleUpdate}
          onCategorized={handleCategorized}
        />
      )}
    </div>
  );
}
