import { useEffect, useState } from "react";
import { Account, api, Category, formatCurrency, Transaction } from "../lib/api";
import TransactionDetailModal from "../components/TransactionDetailModal";

type SortField = "date" | "amount" | "name";
type SortDirection = "asc" | "desc";

export default function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [lastCategorized, setLastCategorized] = useState<{
    name: string;
    categoryId: string;
    categoryName: string;
  } | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  // Advanced filters
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const load = () => {
    const params: Record<string, string> = {};
    if (accountId) params.accountId = accountId;
    if (categoryId) params.categoryId = categoryId;
    if (search) params.search = search;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    api.getTransactions(params)
      .then((txs) => {
        // Apply client-side filters
        let filtered = txs;

        // Amount filters
        if (minAmount) {
          const min = Number(minAmount);
          filtered = filtered.filter((t) => Math.abs(t.amount) >= min);
        }
        if (maxAmount) {
          const max = Number(maxAmount);
          filtered = filtered.filter((t) => Math.abs(t.amount) <= max);
        }

        // Pending filter
        if (showPendingOnly) {
          filtered = filtered.filter((t) => t.pending);
        }

        // Sorting
        filtered.sort((a, b) => {
          let comparison = 0;
          switch (sortField) {
            case "date":
              comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
              break;
            case "amount":
              comparison = Math.abs(a.amount) - Math.abs(b.amount);
              break;
            case "name":
              comparison = a.name.localeCompare(b.name);
              break;
          }
          return sortDirection === "asc" ? comparison : -comparison;
        });

        setTransactions(filtered);
      })
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    api.getAccounts().then(setAccounts);
    api.getCategories().then(setCategories);
  }, []);

  useEffect(load, [accountId, categoryId, search, startDate, endDate, minAmount, maxAmount, showPendingOnly, sortField, sortDirection]);

  const updateCategory = async (tx: Transaction, newCategoryId: string) => {
    await api.updateTransaction(tx.id, { categoryId: newCategoryId || null });

    // Track this categorization for "categorize all similar" feature
    if (newCategoryId) {
      const category = categories.find((c) => c.id === newCategoryId);
      setLastCategorized({
        name: tx.name,
        categoryId: newCategoryId,
        categoryName: category?.name || "Unknown",
      });
    }

    load();
  };

  const categorizeAllSimilar = async () => {
    if (!lastCategorized) return;

    setProcessing(true);
    try {
      const result = await api.categorizeAllSimilar(lastCategorized.name, lastCategorized.categoryId);
      alert(
        `✅ Categorized ${result.count} similar transaction${result.count !== 1 ? "s" : ""} as "${lastCategorized.categoryName}"`
      );
      setLastCategorized(null);
      load();
    } catch (err: any) {
      alert(`Failed to categorize similar transactions: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const autoCategorize = async () => {
    setProcessing(true);
    try {
      const result = await api.autoCategorizeAll();
      const message = `✅ Auto-Categorization Complete!\n\n` +
        `• Processed ${result.total} transactions\n` +
        `• Newly categorized: ${result.categorized}\n` +
        `• Re-categorized (fixed): ${result.recategorized}\n` +
        `• Total changes: ${result.processed}\n\n` +
        `${result.processed > 0 ? "Your transactions have been updated!" : "All transactions are already correctly categorized."}`;
      alert(message);
      load();
    } catch (err: any) {
      alert(`Failed to auto-categorize: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <button
          onClick={autoCategorize}
          disabled={processing}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {processing ? "Processing..." : "Auto-Categorize"}
        </button>
      </div>

      {/* Smart categorization suggestion */}
      {lastCategorized && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-blue-900">🤖 Smart Categorization</h3>
            <p className="text-sm text-blue-800">
              You categorized "{lastCategorized.name}" as "{lastCategorized.categoryName}". Do you want to categorize
              all other transactions with the same name?
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={categorizeAllSimilar}
              disabled={processing}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed whitespace-nowrap"
            >
              Yes, Categorize All
            </button>
            <button
              onClick={() => setLastCategorized(null)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 whitespace-nowrap"
            >
              No Thanks
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border p-4 space-y-4">
        {/* Basic Filters */}
        <div className="flex flex-wrap gap-3">
          <input
            placeholder="Search transactions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded border px-3 py-1.5 text-sm flex-1 min-w-[200px]"
          />
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="rounded border px-3 py-1.5 text-sm">
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.institutionName} · {a.name}
              </option>
            ))}
          </select>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="rounded border px-3 py-1.5 text-sm">
            <option value="">All categories</option>
            <option value="uncategorized">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`px-3 py-1.5 text-sm rounded border ${
              showAdvanced ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-white border-gray-300 text-gray-700"
            } hover:bg-gray-50`}
          >
            {showAdvanced ? "⬆ Hide" : "⬇ More"} Filters
          </button>
        </div>

        {/* Advanced Filters */}
        {showAdvanced && (
          <div className="border-t pt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Amount Range</label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  placeholder="Min"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                  className="rounded border px-2 py-1 text-sm w-full"
                />
                <span className="text-gray-500">to</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                  className="rounded border px-2 py-1 text-sm w-full"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Date Range</label>
              <div className="flex gap-2 items-center">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded border px-2 py-1 text-sm w-full"
                />
                <span className="text-gray-500">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded border px-2 py-1 text-sm w-full"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Sort By</label>
              <div className="flex gap-2">
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as SortField)}
                  className="rounded border px-2 py-1 text-sm flex-1"
                >
                  <option value="date">Date</option>
                  <option value="amount">Amount</option>
                  <option value="name">Name</option>
                </select>
                <button
                  onClick={() => setSortDirection(sortDirection === "asc" ? "desc" : "asc")}
                  className="px-3 py-1 text-sm rounded border bg-white hover:bg-gray-50"
                  title={sortDirection === "asc" ? "Ascending" : "Descending"}
                >
                  {sortDirection === "asc" ? "↑" : "↓"}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPendingOnly}
                  onChange={(e) => setShowPendingOnly(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Show pending only</span>
              </label>
            </div>

            <div className="flex items-end">
              <button
                onClick={() => {
                  setMinAmount("");
                  setMaxAmount("");
                  setStartDate("");
                  setEndDate("");
                  setShowPendingOnly(false);
                  setSortField("date");
                  setSortDirection("desc");
                  setSearch("");
                  setAccountId("");
                  setCategoryId("");
                }}
                className="px-4 py-1.5 text-sm rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
              >
                Clear All Filters
              </button>
            </div>
          </div>
        )}

        {/* Active Filters Summary */}
        <div className="flex flex-wrap gap-2 items-center text-xs">
          {(search || accountId || categoryId || minAmount || maxAmount || startDate || endDate || showPendingOnly) && (
            <span className="text-gray-500">Active filters:</span>
          )}
          {search && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded">Search: "{search}"</span>}
          {accountId && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded">Account</span>}
          {categoryId && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded">Category</span>}
          {minAmount && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded">Min: ${minAmount}</span>}
          {maxAmount && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded">Max: ${maxAmount}</span>}
          {startDate && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded">From: {startDate}</span>}
          {endDate && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded">To: {endDate}</span>}
          {showPendingOnly && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded">Pending only</span>}
          {transactions.length > 0 && (
            <span className="ml-auto text-gray-600 font-medium">
              Showing {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Account</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {transactions.map((tx) => (
              <tr
                key={tx.id}
                className="hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => setSelectedTransaction(tx)}
              >
                <td className="px-4 py-2 whitespace-nowrap">{new Date(tx.date).toLocaleDateString()}</td>
                <td className="px-4 py-2">
                  {tx.name}
                  {tx.pending && <span className="ml-2 text-xs text-amber-600">pending</span>}
                </td>
                <td className="px-4 py-2 text-slate-500">{tx.account?.name}</td>
                <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                  <select
                    value={tx.categoryId ?? ""}
                    onChange={(e) => updateCategory(tx, e.target.value)}
                    className="rounded border px-2 py-1 text-xs"
                  >
                    <option value="">Uncategorized</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={`px-4 py-2 text-right font-medium ${tx.amount > 0 ? "text-slate-900" : "text-emerald-600"}`}>
                  {formatCurrency(tx.amount)}
                </td>
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No transactions found. Link an account and sync to pull in transaction history.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Transaction Detail Modal */}
      {selectedTransaction && (
        <TransactionDetailModal
          transaction={selectedTransaction}
          categories={categories}
          onClose={() => setSelectedTransaction(null)}
          onUpdate={() => {
            setSelectedTransaction(null);
            load();
          }}
        />
      )}
    </div>
  );
}
