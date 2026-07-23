import { useEffect, useState } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { api, currentMonth, DashboardSummary, formatCurrency } from "../lib/api";

const COLORS = [
  "#6366f1",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#a855f7",
  "#ec4899",
  "#84cc16",
  "#14b8a6",
  "#f97316",
];

export default function Dashboard() {
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const loadDashboard = () => {
    api
      .getDashboardSummary(month)
      .then(setSummary)
      .catch((err) => setError(err.message));
  };

  const syncTransactions = async () => {
    setSyncing(true);
    try {
      await api.syncAll();
      const now = new Date();
      setLastSync(now);
      localStorage.setItem('lastSyncTime', now.getTime().toString());
      loadDashboard();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    // Load last sync time from localStorage
    const lastSyncTime = localStorage.getItem('lastSyncTime');
    if (lastSyncTime) {
      setLastSync(new Date(parseInt(lastSyncTime)));
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [month]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex items-center gap-3">
          {lastSync && (
            <span className="text-xs text-gray-500">
              Last synced: {lastSync.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={syncTransactions}
            disabled={syncing}
            className="px-3 py-1.5 text-sm rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
          >
            <span>{syncing ? "⏳" : "🔄"}</span>
            {syncing ? "Syncing..." : "Sync Now"}
          </button>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded border px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {syncing && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3">
          <div className="animate-spin">⏳</div>
          <span className="text-sm text-blue-900">Syncing transactions from your bank...</span>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {summary && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-lg border bg-white p-4">
              <div className="text-sm text-slate-500">Net worth</div>
              <div className="text-2xl font-semibold">{formatCurrency(summary.netWorth)}</div>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <div className="text-sm text-slate-500">Assets</div>
              <div className="text-2xl font-semibold text-emerald-600">{formatCurrency(summary.assets)}</div>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <div className="text-sm text-slate-500">Liabilities</div>
              <div className="text-2xl font-semibold text-red-600">{formatCurrency(summary.liabilities)}</div>
            </div>
          </div>

          <div className="rounded-lg border bg-white p-4">
            <h2 className="font-medium mb-4">Spending by category ({month})</h2>
            {summary.spendingByCategory.length === 0 ? (
              <p className="text-sm text-slate-500">No spending recorded this month yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={summary.spendingByCategory}
                      dataKey="total"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={100}
                    >
                      {summary.spendingByCategory.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="space-y-1 text-sm">
                  {summary.spendingByCategory.map((c, i) => (
                    <li key={c.categoryId ?? "uncategorized"} className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: COLORS[i % COLORS.length] }}
                        />
                        {c.name}
                      </span>
                      <span className="font-medium">{formatCurrency(c.total)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {summary.budgetVsActual.length > 0 && (
            <div className="rounded-lg border bg-white p-4">
              <h2 className="font-medium mb-4">Budget vs actual</h2>
              <div className="space-y-3">
                {summary.budgetVsActual.map((b) => {
                  const pct = b.budgeted > 0 ? Math.min(100, (b.spent / b.budgeted) * 100) : 0;
                  const over = b.spent > b.budgeted;
                  return (
                    <div key={b.categoryId}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{b.categoryName}</span>
                        <span className={over ? "text-red-600 font-medium" : "text-slate-600"}>
                          {formatCurrency(b.spent)} / {formatCurrency(b.budgeted)}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100">
                        <div
                          className={`h-2 rounded-full ${over ? "bg-red-500" : "bg-indigo-500"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
