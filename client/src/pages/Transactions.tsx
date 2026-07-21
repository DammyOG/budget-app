import { useEffect, useState } from "react";
import { Account, api, Category, formatCurrency, Transaction } from "../lib/api";

export default function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    const params: Record<string, string> = {};
    if (accountId) params.accountId = accountId;
    if (categoryId) params.categoryId = categoryId;
    if (search) params.search = search;
    api.getTransactions(params).then(setTransactions).catch((err) => setError(err.message));
  };

  useEffect(() => {
    api.getAccounts().then(setAccounts);
    api.getCategories().then(setCategories);
  }, []);

  useEffect(load, [accountId, categoryId, search]);

  const updateCategory = async (tx: Transaction, newCategoryId: string) => {
    await api.updateTransaction(tx.id, { categoryId: newCategoryId || null });
    load();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Transactions</h1>

      <div className="flex flex-wrap gap-3">
        <input
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded border px-3 py-1.5 text-sm"
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
              <tr key={tx.id}>
                <td className="px-4 py-2 whitespace-nowrap">{new Date(tx.date).toLocaleDateString()}</td>
                <td className="px-4 py-2">
                  {tx.name}
                  {tx.pending && <span className="ml-2 text-xs text-amber-600">pending</span>}
                </td>
                <td className="px-4 py-2 text-slate-500">{tx.account?.name}</td>
                <td className="px-4 py-2">
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
    </div>
  );
}
