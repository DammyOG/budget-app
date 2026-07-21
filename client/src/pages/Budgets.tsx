import { useEffect, useState } from "react";
import { api, Budget, Category, currentMonth, DashboardSummary, formatCurrency } from "../lib/api";

export default function Budgets() {
  const [month, setMonth] = useState(currentMonth());
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = () => {
    api.getCategories().then(setCategories);
    api.getBudgets(month).then((data) => {
      setBudgets(data);
      const d: Record<string, string> = {};
      for (const b of data) d[b.categoryId] = String(b.amount);
      setDrafts(d);
    });
    api.getDashboardSummary(month).then(setSummary);
  };

  useEffect(load, [month]);

  const spentFor = (categoryId: string) =>
    summary?.spendingByCategory.find((s) => s.categoryId === categoryId)?.total || 0;

  const save = async (categoryId: string) => {
    const amount = Number(drafts[categoryId] || 0);
    if (!amount) return;
    await api.setBudget(categoryId, month, amount);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Budgets</h1>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded border px-3 py-1.5 text-sm"
        />
      </div>

      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Budget</th>
              <th className="px-4 py-2">Spent</th>
              <th className="px-4 py-2">Remaining</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {categories
              .filter((c) => !c.isIncome)
              .map((c) => {
                const spent = spentFor(c.id);
                const budgeted = Number(drafts[c.id] || 0);
                const remaining = budgeted - spent;
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-2">{c.name}</td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        step="1"
                        value={drafts[c.id] ?? ""}
                        onChange={(e) => setDrafts({ ...drafts, [c.id]: e.target.value })}
                        onBlur={() => save(c.id)}
                        className="w-24 rounded border px-2 py-1"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-4 py-2">{formatCurrency(spent)}</td>
                    <td className={`px-4 py-2 font-medium ${remaining < 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {budgeted ? formatCurrency(remaining) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {budgets.find((b) => b.categoryId === c.id) && (
                        <button
                          onClick={async () => {
                            const b = budgets.find((b) => b.categoryId === c.id)!;
                            await api.deleteBudget(b.id);
                            load();
                          }}
                          className="text-xs text-slate-400 hover:text-red-600"
                        >
                          Clear
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
