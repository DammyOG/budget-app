import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { api, formatCurrency, formatTransactionDate, type IncomeSpendingSummary, type Transaction, type Category } from "../lib/api";
import TransactionDetailModal from "../components/TransactionDetailModal";
import { useToast } from "../components/ToastProvider";
import { Button, Card, HeroStat, PageHeader, SectionTitle, Segmented, Spinner } from "../components/ui";

type DateRange = "month" | "year" | "all-time" | "custom";
type ChartView = "trend" | "compare" | "net" | "categories";

const COLORS = [
  "#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4",
  "#a855f7", "#ec4899", "#84cc16", "#14b8a6", "#f97316",
  "#8b5cf6", "#10b981", "#f59e0b", "#dc2626", "#0891b2"
];

export default function IncomeSpending() {
  const toast = useToast();
  const [data, setData] = useState<IncomeSpendingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>("month");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear().toString());
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [chartView, setChartView] = useState<ChartView>("trend");

  // New state for category expansion and transactions
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [categoryTransactions, setCategoryTransactions] = useState<Record<string, Transaction[]>>({});
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [processing, setProcessing] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<{
    categorized: number;
    recategorized: number;
    total: number;
    linked: number;
    zelleFixed?: number;
  } | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  useEffect(() => {
    loadData();
    // Clear cached category transactions when date range changes
    setCategoryTransactions({});
    setExpandedCategories(new Set());
  }, [dateRange, selectedMonth, selectedYear, customStart, customEnd]);

  useEffect(() => {
    api.getCategories().then(setAllCategories).catch(console.error);
  }, []);

  function loadData() {
    setLoading(true);
    setError(null);

    const params = getDateRangeParams();

    api
      .getIncomeSpending(params)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  function getDateRangeParams(): { startDate?: string; endDate?: string; groupBy?: string } {
    switch (dateRange) {
      case "month": {
        const [year, month] = selectedMonth.split("-").map(Number);
        const start = new Date(Date.UTC(year, month - 1, 1));
        const end = new Date(Date.UTC(year, month, 1));
        return {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          groupBy: "month",
        };
      }
      case "year": {
        const year = parseInt(selectedYear);
        const start = new Date(Date.UTC(year, 0, 1));
        const end = new Date(Date.UTC(year + 1, 0, 1));
        return {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          groupBy: "month",
        };
      }
      case "all-time": {
        return { groupBy: "month" };
      }
      case "custom": {
        if (customStart && customEnd) {
          return {
            startDate: new Date(customStart).toISOString(),
            endDate: new Date(customEnd).toISOString(),
            groupBy: "month",
          };
        }
        return {};
      }
      default:
        return {};
    }
  }

  // Generate list of months for dropdown
  function getMonthOptions() {
    const months = [];
    const currentDate = new Date();
    // Generate last 24 months
    for (let i = 0; i < 24; i++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const label = date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      months.push({ value, label });
    }
    return months;
  }

  // Generate list of years for dropdown
  function getYearOptions() {
    const years = [];
    const currentYear = new Date().getFullYear();
    // Generate current year and previous 5 years
    for (let i = 0; i <= 5; i++) {
      const year = currentYear - i;
      years.push(year.toString());
    }
    return years;
  }

  function formatMonth(monthStr: string): string {
    const [year, month] = monthStr.split("-");
    return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  }

  // The charts plot the trailing 12 months, not just the selected range.
  // Driving them from the range meant that on the default Month view there
  // was exactly one data point, so every chart was hidden and the page looked
  // like it simply didn't work.
  const chartData = data?.trend ?? data?.byMonth ?? [];

  // What "previous" means follows the selected range: the month before, the
  // year before, or the equivalent stretch before a custom range.
  const comparisonLabel =
    dateRange === "month"
      ? `vs ${data?.previous ? formatMonth(data.previous.startDate.slice(0, 7)) : "last month"}`
      : dateRange === "year"
      ? `vs ${parseInt(selectedYear) - 1}`
      : "vs the period before";

  async function toggleCategory(categoryId: string | null, isIncome: boolean) {
    const key = `${isIncome ? "income" : "expense"}-${categoryId || "uncategorized"}`;
    const newExpanded = new Set(expandedCategories);

    if (expandedCategories.has(key)) {
      newExpanded.delete(key);
      setExpandedCategories(newExpanded);
    } else {
      newExpanded.add(key);
      setExpandedCategories(newExpanded);

      // Always reload transactions when expanding (to ensure we get fresh data)
      const params = getDateRangeParams();
      const transactionsParams: Record<string, string> = {
        categoryId: categoryId || "uncategorized",
        limit: "10000", // Load all transactions, not just 500
      };
      if (params.startDate) transactionsParams.startDate = params.startDate;
      if (params.endDate) transactionsParams.endDate = params.endDate;

      try {
        const { transactions } = await api.getTransactions(transactionsParams);
        // Filter by income/expense and ensure they match the category.
        // Keyed off kind, not raw sign — a refund is a negative expense, and
        // splitting on sign here would have counted it as income even though
        // the dashboard (which does use kind) correctly nets it against
        // spending instead.
        const filtered = transactions.filter((t) => {
          const isCorrectType = isIncome ? t.kind === "income" : t.kind === "expense";
          // Check if category matches (or both are null for uncategorized)
          const isCategoryMatch = categoryId ? t.categoryId === categoryId : !t.categoryId;
          return isCorrectType && isCategoryMatch;
        });

        console.log(`Loaded ${filtered.length} transactions for ${key}:`, filtered.map(t => ({
          name: t.name,
          amountCents: t.amountCents,
          date: t.date,
          categoryId: t.categoryId
        })));

        setCategoryTransactions((prev) => ({ ...prev, [key]: filtered }));
      } catch (err) {
        console.error("Failed to load transactions:", err);
      }
    }
  }

  async function updateTransactionCategory(transactionId: string, newCategoryId: string | null, categoryKey: string) {
    try {
      await api.updateTransaction(transactionId, { categoryId: newCategoryId });
      // Reload transactions for this category
      setCategoryTransactions((prev) => {
        const updated = { ...prev };
        updated[categoryKey] = updated[categoryKey].filter((t) => t.id !== transactionId);
        return updated;
      });
      // Reload summary data
      loadData();
    } catch (err) {
      console.error("Failed to update category:", err);
    }
  }

  async function cleanupTransfers() {
    setProcessing(true);
    try {
      // Step 1: Auto-categorize transfers
      const categorizeResult = await api.autoCategorizeAll();

      // Step 2: Auto-link high-confidence transfer pairs (includes Zelle fix)
      const linkResult = await api.autoLinkTransfers();

      setCleanupResult({
        categorized: categorizeResult.categorized,
        recategorized: categorizeResult.recategorized,
        total: categorizeResult.total,
        linked: linkResult.linked,
        zelleFixed: linkResult.zelleFixed,
      });

      // Reload data
      loadData();
      // Clear expanded categories cache
      setCategoryTransactions({});
    } catch (err: any) {
      toast.error(`Failed to clean up transfers: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  }

  if (loading) return <Spinner />;

  if (error) {
    return (
      <div>
        <PageHeader title="Income & Spending" />
        <Card className="border-red-200 bg-red-50 text-sm text-red-700">{error}</Card>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Income & Spending"
        action={
          <Button size="sm" onClick={cleanupTransfers} disabled={processing}>
            {processing ? "Working…" : "🔄 Clean up"}
          </Button>
        }
      />

      {cleanupResult && (
        <Card className="relative border-emerald-200 bg-emerald-50">
          <button
            onClick={() => setCleanupResult(null)}
            className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center text-lg leading-none text-emerald-700"
            aria-label="Dismiss"
          >
            ×
          </button>
          <h2 className="mb-2 pr-10 font-semibold text-emerald-900">✅ Cleanup complete</h2>
          <ul className="space-y-1 text-sm text-emerald-800">
            <li>
              Categorized {cleanupResult.categorized} new transaction{cleanupResult.categorized !== 1 ? "s" : ""}
              {cleanupResult.recategorized > 0 && `, fixed ${cleanupResult.recategorized} miscategorized`} (
              {cleanupResult.total} checked)
            </li>
            <li>
              Linked {cleanupResult.linked} transfer pair{cleanupResult.linked !== 1 ? "s" : ""}
              {cleanupResult.zelleFixed ? `, including ${cleanupResult.zelleFixed} Zelle transfers` : ""}
            </li>
          </ul>
          <p className="mt-2 text-xs text-emerald-700">
            Generic "payment thank you" messages are left uncategorized for manual review.
          </p>
        </Card>
      )}

      {/* Was a permanent four-item explainer taking most of the first screen.
          It answers a question you only ask once, so it folds away. */}
      <details className="rounded-2xl border border-amber-200 bg-amber-50">
        <summary className="flex min-h-[44px] cursor-pointer items-center px-4 text-sm font-medium text-amber-900">
          📊 Totals look wrong? Transfers may be double-counted
        </summary>
        <div className="px-4 pb-4 text-sm text-amber-800">
          <p className="mb-2">
            If inter-account transfers (BofA → Ally) or credit card payments show as both income and expenses, tap
            "Clean up" above. It will:
          </p>
          <ul className="list-inside list-disc space-y-1">
            <li>Auto-categorize transfer transactions</li>
            <li>Link matching transactions between your accounts</li>
            <li>Exclude them from income and spending totals</li>
          </ul>
        </div>
      </details>

      <Segmented
        options={[
          { value: "month", label: "Month" },
          { value: "year", label: "Year" },
          { value: "all-time", label: "All" },
          { value: "custom", label: "Custom" },
        ]}
        value={dateRange}
        onChange={(v) => setDateRange(v as typeof dateRange)}
      />

      {dateRange === "month" && (
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          aria-label="Select month"
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
        >
          {getMonthOptions().map((month) => (
            <option key={month.value} value={month.value}>
              {month.label}
            </option>
          ))}
        </select>
      )}

      {dateRange === "year" && (
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
          aria-label="Select year"
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
        >
          {getYearOptions().map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      )}

      {dateRange === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-medium text-slate-600">
            Start
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            End
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm"
            />
          </label>
        </div>
      )}

      <HeroStat
        label="Net income"
        value={formatCurrency(data.netIncome)}
        tone={data.netIncome >= 0 ? "positive" : "negative"}
      >
        <div className="mt-3 flex gap-4 border-t pt-3 text-sm">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-slate-500">Income</div>
            <div className="truncate font-semibold tabular-nums text-emerald-600">
              {formatCurrency(data.totalIncome)}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-slate-500">Expenses</div>
            <div className="truncate font-semibold tabular-nums text-red-600">
              {formatCurrency(data.totalExpenses)}
            </div>
          </div>
        </div>
      </HeroStat>

      {/* One chart at a time. Four stacked 300px charts is 1,200px of
          scrolling on a phone, and you can only look at one anyway. */}
      {chartData.length > 1 && (
        <Card>
          <Segmented
            className="mb-3"
            options={[
              { value: "trend", label: "Trend" },
              { value: "compare", label: "Compare" },
              { value: "net", label: "Net" },
              { value: "categories", label: "Top" },
            ]}
            value={chartView}
            onChange={setChartView}
          />
          {chartView === "trend" && (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  tickFormatter={(value) => {
                    const [year, month] = value.split("-");
                    return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString("en-US", {
                      month: "short",
                      year: "2-digit",
                    });
                  }}
                />
                <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  labelFormatter={(label) => formatMonth(label)}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="income"
                  stackId="1"
                  stroke="#22c55e"
                  fill="#86efac"
                  name="Income"
                />
                <Area
                  type="monotone"
                  dataKey="expenses"
                  stackId="2"
                  stroke="#ef4444"
                  fill="#fca5a5"
                  name="Expenses"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}

          {chartView === "compare" && (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  tickFormatter={(value) => {
                    const [year, month] = value.split("-");
                    return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString("en-US", {
                      month: "short",
                    });
                  }}
                />
                <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  labelFormatter={(label) => formatMonth(label)}
                />
                <Legend />
                <Bar dataKey="income" fill="#22c55e" name="Income" />
                <Bar dataKey="expenses" fill="#ef4444" name="Expenses" />
              </BarChart>
            </ResponsiveContainer>
          )}

          {chartView === "net" && (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  tickFormatter={(value) => {
                    const [year, month] = value.split("-");
                    return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString("en-US", {
                      month: "short",
                    });
                  }}
                />
                <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  labelFormatter={(label) => formatMonth(label)}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="net"
                  stroke="#6366f1"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  name="Net Income"
                />
              </LineChart>
            </ResponsiveContainer>
          )}

          {chartView === "categories" &&
            (data.expensesByCategory.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={data.expensesByCategory.slice(0, 8)}
                    dataKey="total"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={85}
                  >
                    {data.expensesByCategory
                      .slice(0, 8)
                      .map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                  </Pie>
                  {/* Slice labels overlapped illegibly at phone width; the
                      legend below carries the names instead. */}
                  <Legend verticalAlign="bottom" iconSize={8} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-16 text-center text-sm text-slate-500">No expense data available</p>
            ))}
        </Card>
      )}

      {/* Three gradient cards, each with its own heading, repeated numbers
          already shown above — about 450px of phone screen to say "up or
          down since last month". One row per metric says the same thing. */}
      {data.previous && (
        <Card>
          {(() => {
            const prev = data.previous;
            const rows = [
              { label: "Income", now: data.totalIncome, was: prev.totalIncome, upIsGood: true },
              { label: "Expenses", now: data.totalExpenses, was: prev.totalExpenses, upIsGood: false },
              { label: "Net", now: data.netIncome, was: prev.netIncome, upIsGood: true },
            ];
            const hadActivity = prev.totalIncome !== 0 || prev.totalExpenses !== 0;
            return (
              <>
                <SectionTitle>{comparisonLabel}</SectionTitle>
                {!hadActivity && (
                  <p className="-mt-1 mb-2 text-xs text-slate-400">
                    Nothing recorded in that period, so the changes below are against zero.
                  </p>
                )}
                <div className="divide-y">
                  {rows.map((r) => {
                    const change = r.now - r.was;
                    const pct = r.was !== 0 ? (change / Math.abs(r.was)) * 100 : 0;
                    const good = change === 0 ? null : r.upIsGood ? change > 0 : change < 0;
                    return (
                      <div key={r.label} className="flex items-center justify-between gap-3 py-2.5">
                        <span className="text-sm text-slate-600">{r.label}</span>
                        <div className="flex items-baseline gap-2">
                          <span className="font-semibold tabular-nums">{formatCurrency(r.now)}</span>
                          <span
                            className={`text-xs tabular-nums ${
                              good === null ? "text-slate-400" : good ? "text-emerald-600" : "text-red-600"
                            }`}
                          >
                            {change >= 0 ? "↑" : "↓"} {Math.abs(pct).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </Card>
      )}

      {data.byMonth && data.byMonth.length > 0 && (
        <Card>
          <SectionTitle>Month by month</SectionTitle>
          {/*
            Not a <table>: with four columns, a table on a phone either
            overflows or hides columns behind a scroll with no indication
            anything's cut off (Expenses/Net disappeared entirely in
            testing). This wraps naturally at any width instead.
          */}
          <div className="divide-y">
            {data.byMonth.map((month) => (
              <div key={month.month} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-3">
                <span className="min-w-[7rem] text-sm font-medium">{formatMonth(month.month)}</span>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm tabular-nums">
                  <span className="text-emerald-600">
                    <span className="mr-1 text-xs text-slate-400">In</span>
                    {formatCurrency(month.income)}
                  </span>
                  <span className="text-red-600">
                    <span className="mr-1 text-xs text-slate-400">Out</span>
                    {formatCurrency(month.expenses)}
                  </span>
                  <span className={`font-medium ${month.net >= 0 ? "text-indigo-600" : "text-orange-600"}`}>
                    <span className="mr-1 text-xs font-normal text-slate-400">Net</span>
                    {formatCurrency(month.net)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Income and Expenses by Category */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <SectionTitle>Income by category</SectionTitle>
          <p className="mb-3 text-xs text-slate-500">Tap a category to see its transactions.</p>
          {data.incomeByCategory.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">No income recorded for this period</p>
          ) : (
            <div className="space-y-2">
              {data.incomeByCategory.map((cat) => {
                const key = `income-${cat.categoryId || "uncategorized"}`;
                const isExpanded = expandedCategories.has(key);
                const transactions = categoryTransactions[key] || [];

                return (
                  <div key={cat.categoryId || "uncategorized"} className="overflow-hidden rounded-xl border border-slate-200">
                    <button
                      onClick={() => toggleCategory(cat.categoryId, true)}
                      className="flex min-h-[48px] w-full items-center justify-between gap-2 p-3 text-left transition-colors active:bg-slate-50"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 text-slate-400">{isExpanded ? "▾" : "▸"}</span>
                        <div className="min-w-0 truncate">
                          <span className="font-medium">{cat.name}</span>
                          {isExpanded && transactions.length > 0 && (
                            <span className="ml-2 text-xs text-gray-500">({transactions.length} transactions)</span>
                          )}
                        </div>
                      </div>
                      <span className="shrink-0 font-medium tabular-nums text-emerald-600">{formatCurrency(cat.total)}</span>
                    </button>

                    {isExpanded && (
                      <div className="border-t bg-slate-50">
                        {transactions.length === 0 ? (
                          <p className="p-4 text-sm text-gray-500">Loading transactions...</p>
                        ) : (
                          <>
                            <div className="divide-y">
                              {transactions.map((tx) => (
                                <div
                                  key={tx.id}
                                  className="cursor-pointer p-3 transition-colors active:bg-slate-100"
                                  onClick={() => setSelectedTransaction(tx)}
                                >
                                  {/* Name, date, category picker and amount in
                                      one row left no usable width for any of
                                      them on a phone. The picker gets its own
                                      line underneath. */}
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate text-sm font-medium">{tx.name}</div>
                                      <div className="truncate text-xs text-slate-500">
                                        {formatTransactionDate(tx.date)} · {tx.account.name}
                                      </div>
                                    </div>
                                    <span className="shrink-0 text-sm font-medium tabular-nums text-emerald-600">
                                      {formatCurrency(Math.abs(tx.amountCents))}
                                    </span>
                                  </div>
                                  <select
                                    value={tx.categoryId ?? ""}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      updateTransactionCategory(tx.id, e.target.value || null, key);
                                    }}
                                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <option value="">Uncategorized</option>
                                    {allCategories.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              ))}
                            </div>
                            <div className="flex justify-between border-t bg-slate-100 p-3 text-xs text-slate-600">
                              <span>Showing {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}</span>
                              <span>
                                Sum: {formatCurrency(transactions.reduce((sum, tx) => sum + Math.abs(tx.amountCents), 0))}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle>Spending by category</SectionTitle>
          <p className="mb-3 text-xs text-slate-500">Tap a category to see its transactions.</p>
          {data.expensesByCategory.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">No expenses recorded for this period</p>
          ) : (
            <div className="space-y-2">
              {data.expensesByCategory.map((cat) => {
                const key = `expense-${cat.categoryId || "uncategorized"}`;
                const isExpanded = expandedCategories.has(key);
                const transactions = categoryTransactions[key] || [];

                return (
                  <div key={cat.categoryId || "uncategorized"} className="overflow-hidden rounded-xl border border-slate-200">
                    <button
                      onClick={() => toggleCategory(cat.categoryId, false)}
                      className="flex min-h-[48px] w-full items-center justify-between gap-2 p-3 text-left transition-colors active:bg-slate-50"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 text-slate-400">{isExpanded ? "▾" : "▸"}</span>
                        <div className="min-w-0 truncate">
                          <span className="font-medium">{cat.name}</span>
                          {isExpanded && transactions.length > 0 && (
                            <span className="ml-2 text-xs text-gray-500">({transactions.length} transactions)</span>
                          )}
                        </div>
                      </div>
                      <span className="shrink-0 font-medium tabular-nums text-red-600">{formatCurrency(cat.total)}</span>
                    </button>

                    {isExpanded && (
                      <div className="border-t bg-slate-50">
                        {transactions.length === 0 ? (
                          <p className="p-4 text-sm text-gray-500">Loading transactions...</p>
                        ) : (
                          <>
                            <div className="divide-y">
                              {transactions.map((tx) => (
                                <div
                                  key={tx.id}
                                  className="cursor-pointer p-3 transition-colors active:bg-slate-100"
                                  onClick={() => setSelectedTransaction(tx)}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate text-sm font-medium">{tx.name}</div>
                                      <div className="truncate text-xs text-slate-500">
                                        {formatTransactionDate(tx.date)} · {tx.account.name}
                                      </div>
                                    </div>
                                    <span className="shrink-0 text-sm font-medium tabular-nums text-red-600">
                                      {formatCurrency(tx.amountCents)}
                                    </span>
                                  </div>
                                  <select
                                    value={tx.categoryId ?? ""}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      updateTransactionCategory(tx.id, e.target.value || null, key);
                                    }}
                                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <option value="">Uncategorized</option>
                                    {allCategories.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              ))}
                            </div>
                            <div className="flex justify-between border-t bg-slate-100 p-3 text-xs text-slate-600">
                              <span>Showing {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}</span>
                              <span>Sum: {formatCurrency(transactions.reduce((sum, tx) => sum + tx.amountCents, 0))}</span>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Transaction Detail Modal */}
      {selectedTransaction && (
        <TransactionDetailModal
          transaction={selectedTransaction}
          categories={allCategories}
          onClose={() => setSelectedTransaction(null)}
          onUpdate={() => {
            setSelectedTransaction(null);
            loadData();
            // Clear cached transactions to force reload
            setCategoryTransactions({});
          }}
        />
      )}
    </div>
  );
}
