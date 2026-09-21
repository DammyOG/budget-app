import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { api, currentMonth, DashboardSummary, formatCurrency } from "../lib/api";
import OnboardingIntro from "../components/OnboardingIntro";
import {
  Button,
  Card,
  HeroStat,
  MonthStepper,
  PageHeader,
  Progress,
  SectionTitle,
  Spinner,
  StatRow,
} from "../components/ui";

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
    setError(null);
    try {
      await api.syncAll();
      const now = new Date();
      setLastSync(now);
      localStorage.setItem("lastSyncTime", now.getTime().toString());
      loadDashboard();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    const lastSyncTime = localStorage.getItem("lastSyncTime");
    if (lastSyncTime) setLastSync(new Date(parseInt(lastSyncTime)));
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [month]);

  const topCategories = summary?.spendingByCategory.slice(0, 6) ?? [];
  const maxCategory = topCategories[0]?.total ?? 0;

  return (
    <div className="space-y-4">
      <OnboardingIntro />

      <PageHeader
        title="Dashboard"
        subtitle={lastSync ? `Synced ${lastSync.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : undefined}
        action={
          <Button onClick={syncTransactions} disabled={syncing} size="sm" aria-label="Sync now">
            <span className={syncing ? "inline-block animate-spin" : ""}>{syncing ? "⏳" : "🔄"}</span>
            <span className="hidden sm:inline">{syncing ? "Syncing…" : "Sync"}</span>
          </Button>
        }
      />

      <MonthStepper month={month} onChange={setMonth} max={currentMonth()} />

      {error && (
        <Card className="border-red-200 bg-red-50 text-sm text-red-700">{error}</Card>
      )}

      {!summary ? (
        <Spinner />
      ) : (
        <>
          {/* Net worth is the headline; assets and liabilities are the
              breakdown of it, so they read as one card rather than three
              competing ones. */}
          <HeroStat label="Net worth" value={formatCurrency(summary.netWorth)}>
            <div className="mt-3 flex gap-4 border-t pt-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-slate-500">Assets</div>
                <div className="truncate font-semibold tabular-nums text-emerald-600">
                  {formatCurrency(summary.assets)}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-slate-500">Liabilities</div>
                <div className="truncate font-semibold tabular-nums text-red-600">
                  {formatCurrency(summary.liabilities)}
                </div>
              </div>
            </div>
          </HeroStat>

          <StatRow
            items={[
              { label: "Income", value: formatCurrency(summary.income), tone: "positive" },
              { label: "Spending", value: formatCurrency(summary.spending) },
              {
                label: "Net flow",
                value: formatCurrency(summary.netCashFlow),
                tone: summary.netCashFlow < 0 ? "negative" : "positive",
              },
            ]}
          />

          <p className="px-1 text-xs text-slate-400">
            Transfers between your own accounts (and credit card payments) are excluded from income and spending.
          </p>

          <Card>
            <SectionTitle
              action={
                <Link
                  to="/income-spending"
                  className="flex min-h-[40px] items-center text-sm font-medium text-indigo-600"
                >
                  Details
                </Link>
              }
            >
              Spending by category
            </SectionTitle>
            {summary.spendingByCategory.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">No spending recorded this month yet.</p>
            ) : (
              <div className="grid items-center gap-4 md:grid-cols-2">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={summary.spendingByCategory}
                      dataKey="total"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={1}
                    >
                      {summary.spendingByCategory.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Bars under each name rather than a name/amount pair, so
                    long category names have the full width and relative size
                    is readable without going back to the donut. */}
                <ul className="space-y-2.5">
                  {topCategories.map((c, i) => (
                    <li key={c.categoryId ?? "uncategorized"}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: COLORS[i % COLORS.length] }}
                          />
                          <span className="truncate">{c.name}</span>
                        </span>
                        <span className="shrink-0 font-medium tabular-nums">{formatCurrency(c.total)}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${maxCategory > 0 ? (c.total / maxCategory) * 100 : 0}%`,
                            backgroundColor: COLORS[i % COLORS.length],
                          }}
                        />
                      </div>
                    </li>
                  ))}
                  {summary.spendingByCategory.length > topCategories.length && (
                    <li className="pt-1 text-xs text-slate-400">
                      +{summary.spendingByCategory.length - topCategories.length} more categories
                    </li>
                  )}
                </ul>
              </div>
            )}
          </Card>

          {summary.budgetVsActual.length > 0 && (
            <Card>
              <SectionTitle
                action={
                  <Link
                    to="/budgets"
                    className="flex min-h-[40px] items-center text-sm font-medium text-indigo-600"
                  >
                    Edit
                  </Link>
                }
              >
                Budget vs actual
              </SectionTitle>
              <div className="space-y-3">
                {summary.budgetVsActual.map((b) => {
                  const pct = b.budgeted > 0 ? (b.spent / b.budgeted) * 100 : 0;
                  const over = b.spent > b.budgeted;
                  return (
                    <div key={b.categoryId}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate">{b.categoryName}</span>
                        <span
                          className={`shrink-0 tabular-nums ${over ? "font-medium text-red-600" : "text-slate-500"}`}
                        >
                          {formatCurrency(b.spent)}
                          <span className="text-slate-400"> / {formatCurrency(b.budgeted)}</span>
                        </span>
                      </div>
                      <Progress pct={pct} over={over} />
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
