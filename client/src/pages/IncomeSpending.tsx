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
import { api, formatCurrency, type IncomeSpendingSummary, type Transaction, type Category } from "../lib/api";
import TransactionDetailModal from "../components/TransactionDetailModal";

type DateRange = "month" | "year" | "all-time" | "custom";

const COLORS = [
  "#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4",
  "#a855f7", "#ec4899", "#84cc16", "#14b8a6", "#f97316",
  "#8b5cf6", "#10b981", "#f59e0b", "#dc2626", "#0891b2"
];

export default function IncomeSpending() {
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

  // New state for category expansion and transactions
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [categoryTransactions, setCategoryTransactions] = useState<Record<string, Transaction[]>>({});
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [processing, setProcessing] = useState(false);
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
        const transactions = await api.getTransactions(transactionsParams);
        // Filter by income/expense and ensure they match the category
        const filtered = transactions.filter((t) => {
          // Check if it's income or expense
          const isCorrectType = isIncome ? t.amount < 0 : t.amount > 0;
          // Check if category matches (or both are null for uncategorized)
          const isCategoryMatch = categoryId ? t.categoryId === categoryId : !t.categoryId;
          return isCorrectType && isCategoryMatch;
        });

        console.log(`Loaded ${filtered.length} transactions for ${key}:`, filtered.map(t => ({
          name: t.name,
          amount: t.amount,
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

      // Show results
      const zelleMessage = linkResult.zelleFixed ? `\n• Fixed ${linkResult.zelleFixed} Zelle internal transfers` : "";
      alert(
        `✅ Cleanup Complete!\n\n` +
        `Categorization:\n` +
        `• Newly categorized: ${categorizeResult.categorized}\n` +
        `• Re-categorized (fixed): ${categorizeResult.recategorized}\n` +
        `• Total processed: ${categorizeResult.total}\n\n` +
        `Transfers:\n` +
        `• Linked ${linkResult.linked} transfer pairs${zelleMessage}\n\n` +
        `Your income/spending totals have been updated!\n\n` +
        `Note: Generic "payment thank you" messages are left uncategorized for manual review.`
      );

      // Reload data
      loadData();
      // Clear expanded categories cache
      setCategoryTransactions({});
    } catch (err: any) {
      alert(`Failed to cleanup transfers: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Income & Spending</h1>
        <p>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Income & Spending</h1>
        <p className="text-red-600">Error: {error}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Income & Spending</h1>
        <button
          onClick={cleanupTransfers}
          disabled={processing}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {processing ? "Processing..." : "🔄 Clean Up Transfers"}
        </button>
      </div>

      {/* Info box about transfers */}
      <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h2 className="font-semibold text-yellow-900 mb-2">📊 Getting Accurate Totals</h2>
        <p className="text-sm text-yellow-800 mb-2">
          If you see inter-account transfers (like BofA → Ally) or credit card payments showing as both income and
          expenses, click the "Clean Up Transfers" button above. This will:
        </p>
        <ul className="text-sm text-yellow-800 list-disc list-inside space-y-1">
          <li>Auto-categorize transfer transactions (deposits to Robinhood, credit card payments, etc.)</li>
          <li>Link matching transactions between your accounts</li>
          <li>Exclude these from your income/spending totals</li>
        </ul>
      </div>

      {/* Date Range Filters */}
      <div className="mb-6 bg-white p-4 rounded-lg shadow">
        <div className="flex flex-wrap gap-2 items-center">
          <label className="font-medium">Time Period:</label>
          <button
            onClick={() => setDateRange("month")}
            className={`px-4 py-2 rounded ${
              dateRange === "month"
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Month
          </button>
          <button
            onClick={() => setDateRange("year")}
            className={`px-4 py-2 rounded ${
              dateRange === "year"
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Year
          </button>
          <button
            onClick={() => setDateRange("all-time")}
            className={`px-4 py-2 rounded ${
              dateRange === "all-time"
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            All Time
          </button>
          <button
            onClick={() => setDateRange("custom")}
            className={`px-4 py-2 rounded ${
              dateRange === "custom"
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Custom Range
          </button>
        </div>

        {/* Month Selector */}
        {dateRange === "month" && (
          <div className="mt-4">
            <label className="block text-sm font-medium mb-1">Select Month</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="border rounded px-3 py-2 w-64"
            >
              {getMonthOptions().map((month) => (
                <option key={month.value} value={month.value}>
                  {month.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Year Selector */}
        {dateRange === "year" && (
          <div className="mt-4">
            <label className="block text-sm font-medium mb-1">Select Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="border rounded px-3 py-2 w-64"
            >
              {getYearOptions().map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Custom Date Range Picker */}
        {dateRange === "custom" && (
          <div className="mt-4 flex gap-4 items-center">
            <div>
              <label className="block text-sm font-medium mb-1">Start Date</label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Date</label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="border rounded px-3 py-2"
              />
            </div>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-green-50 p-6 rounded-lg shadow">
          <h2 className="text-sm font-medium text-green-800 mb-2">Total Income</h2>
          <p className="text-3xl font-bold text-green-900">{formatCurrency(data.totalIncome)}</p>
        </div>
        <div className="bg-red-50 p-6 rounded-lg shadow">
          <h2 className="text-sm font-medium text-red-800 mb-2">Total Expenses</h2>
          <p className="text-3xl font-bold text-red-900">{formatCurrency(data.totalExpenses)}</p>
        </div>
        <div className={`p-6 rounded-lg shadow ${data.netIncome >= 0 ? "bg-blue-50" : "bg-orange-50"}`}>
          <h2
            className={`text-sm font-medium mb-2 ${data.netIncome >= 0 ? "text-blue-800" : "text-orange-800"}`}
          >
            Net Income
          </h2>
          <p
            className={`text-3xl font-bold ${data.netIncome >= 0 ? "text-blue-900" : "text-orange-900"}`}
          >
            {formatCurrency(data.netIncome)}
          </p>
        </div>
      </div>

      {/* Charts Section */}
      {data.byMonth && data.byMonth.length > 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Spending Trends Chart */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-bold mb-4">Spending Trends</h2>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data.byMonth}>
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
          </div>

          {/* Income vs Expenses Bar Chart */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-bold mb-4">Income vs Expenses</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.byMonth}>
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
          </div>

          {/* Net Income Trend */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-bold mb-4">Net Income Trend</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.byMonth}>
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
          </div>

          {/* Category Breakdown Pie Charts */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-bold mb-4">Top Spending Categories</h2>
            {data.expensesByCategory.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={data.expensesByCategory
                      .filter((cat) => cat.name !== "Transfer")
                      .slice(0, 8)}
                    dataKey="total"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {data.expensesByCategory
                      .filter((cat) => cat.name !== "Transfer")
                      .slice(0, 8)
                      .map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500 text-center py-20">No expense data available</p>
            )}
          </div>
        </div>
      )}

      {/* Month-over-Month Comparison */}
      {data.byMonth && data.byMonth.length >= 2 && (
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-xl font-bold mb-4">Month-over-Month Comparison</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(() => {
              const currentMonth = data.byMonth[data.byMonth.length - 1];
              const previousMonth = data.byMonth[data.byMonth.length - 2];

              const incomeChange = currentMonth.income - previousMonth.income;
              const expensesChange = currentMonth.expenses - previousMonth.expenses;
              const netChange = currentMonth.net - previousMonth.net;

              const incomeChangePercent = previousMonth.income !== 0
                ? ((incomeChange / Math.abs(previousMonth.income)) * 100)
                : 0;
              const expensesChangePercent = previousMonth.expenses !== 0
                ? ((expensesChange / previousMonth.expenses) * 100)
                : 0;
              const netChangePercent = previousMonth.net !== 0
                ? ((netChange / Math.abs(previousMonth.net)) * 100)
                : 0;

              const ChangeIndicator = ({ value, percent }: { value: number; percent: number }) => {
                const isPositive = value > 0;
                const isIncome = false; // Will be passed as prop
                return (
                  <div className="flex items-center gap-1 text-sm">
                    <span className={isPositive ? "text-green-600" : "text-red-600"}>
                      {isPositive ? "↑" : "↓"} {formatCurrency(Math.abs(value))}
                    </span>
                    <span className="text-gray-500">
                      ({Math.abs(percent).toFixed(1)}%)
                    </span>
                  </div>
                );
              };

              return (
                <>
                  <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-200">
                    <div className="text-sm text-green-800 font-medium mb-1">Income Change</div>
                    <div className="text-2xl font-bold text-green-900 mb-2">
                      {formatCurrency(currentMonth.income)}
                    </div>
                    <div className="text-xs text-green-700 mb-1">
                      vs {formatMonth(previousMonth.month)}: {formatCurrency(previousMonth.income)}
                    </div>
                    <div className={`flex items-center gap-1 text-sm ${incomeChange < 0 ? "text-red-600" : "text-green-600"}`}>
                      <span>{incomeChange < 0 ? "↓" : "↑"} {formatCurrency(Math.abs(incomeChange))}</span>
                      <span className="text-gray-600">({Math.abs(incomeChangePercent).toFixed(1)}%)</span>
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-lg border border-red-200">
                    <div className="text-sm text-red-800 font-medium mb-1">Expenses Change</div>
                    <div className="text-2xl font-bold text-red-900 mb-2">
                      {formatCurrency(currentMonth.expenses)}
                    </div>
                    <div className="text-xs text-red-700 mb-1">
                      vs {formatMonth(previousMonth.month)}: {formatCurrency(previousMonth.expenses)}
                    </div>
                    <div className={`flex items-center gap-1 text-sm ${expensesChange > 0 ? "text-red-600" : "text-green-600"}`}>
                      <span>{expensesChange > 0 ? "↑" : "↓"} {formatCurrency(Math.abs(expensesChange))}</span>
                      <span className="text-gray-600">({Math.abs(expensesChangePercent).toFixed(1)}%)</span>
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
                    <div className="text-sm text-blue-800 font-medium mb-1">Net Income Change</div>
                    <div className="text-2xl font-bold text-blue-900 mb-2">
                      {formatCurrency(currentMonth.net)}
                    </div>
                    <div className="text-xs text-blue-700 mb-1">
                      vs {formatMonth(previousMonth.month)}: {formatCurrency(previousMonth.net)}
                    </div>
                    <div className={`flex items-center gap-1 text-sm ${netChange < 0 ? "text-red-600" : "text-green-600"}`}>
                      <span>{netChange < 0 ? "↓" : "↑"} {formatCurrency(Math.abs(netChange))}</span>
                      <span className="text-gray-600">({Math.abs(netChangePercent).toFixed(1)}%)</span>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Month-by-Month Breakdown */}
      {data.byMonth && data.byMonth.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-xl font-bold mb-4">Month-by-Month Breakdown</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Month
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Income
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Expenses
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Net
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.byMonth.map((month) => (
                  <tr key={month.month}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatMonth(month.month)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-green-600">
                      {formatCurrency(month.income)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-red-600">
                      {formatCurrency(month.expenses)}
                    </td>
                    <td
                      className={`px-6 py-4 whitespace-nowrap text-sm text-right font-medium ${
                        month.net >= 0 ? "text-blue-600" : "text-orange-600"
                      }`}
                    >
                      {formatCurrency(month.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Income and Expenses by Category */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Income by Category */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">Income by Category</h2>
          <p className="text-sm text-gray-500 mb-4">
            Click on a category to see individual transactions. "Uncategorized" means transactions that haven't been assigned a category yet.
          </p>
          {data.incomeByCategory.length === 0 ? (
            <p className="text-gray-500">No income recorded for this period</p>
          ) : (
            <div className="space-y-2">
              {data.incomeByCategory.filter((cat) => cat.name !== "Transfer").map((cat) => {
                const key = `income-${cat.categoryId || "uncategorized"}`;
                const isExpanded = expandedCategories.has(key);
                const transactions = categoryTransactions[key] || [];

                return (
                  <div key={cat.categoryId || "uncategorized"} className="border rounded-lg">
                    <button
                      onClick={() => toggleCategory(cat.categoryId, true)}
                      className="w-full flex justify-between items-center p-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">{isExpanded ? "▼" : "▶"}</span>
                        <div>
                          <span className="text-gray-700 font-medium">{cat.name}</span>
                          {isExpanded && transactions.length > 0 && (
                            <span className="ml-2 text-xs text-gray-500">({transactions.length} transactions)</span>
                          )}
                        </div>
                      </div>
                      <span className="font-medium text-green-600">{formatCurrency(cat.total)}</span>
                    </button>

                    {isExpanded && (
                      <div className="border-t bg-gray-50">
                        {transactions.length === 0 ? (
                          <p className="p-4 text-sm text-gray-500">Loading transactions...</p>
                        ) : (
                          <>
                            <div className="divide-y">
                              {transactions.map((tx) => (
                                <div
                                  key={tx.id}
                                  className="p-3 hover:bg-gray-100 cursor-pointer transition-colors"
                                  onClick={() => setSelectedTransaction(tx)}
                                >
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium text-gray-900 truncate">{tx.name}</div>
                                      <div className="text-xs text-gray-500">
                                        {new Date(tx.date).toLocaleDateString()} · {tx.account.name}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <select
                                        value={tx.categoryId ?? ""}
                                        onChange={(e) => {
                                          e.stopPropagation();
                                          updateTransactionCategory(tx.id, e.target.value || null, key);
                                        }}
                                        className="text-xs border rounded px-2 py-1 flex-1 sm:flex-initial"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <option value="">Uncategorized</option>
                                        {allCategories.map((c) => (
                                          <option key={c.id} value={c.id}>
                                            {c.name}
                                          </option>
                                        ))}
                                      </select>
                                      <span className="text-sm font-medium text-green-600 whitespace-nowrap">
                                        {formatCurrency(Math.abs(tx.amount))}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="p-3 border-t bg-gray-100 text-xs text-gray-600 flex justify-between">
                              <span>Showing {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}</span>
                              <span>
                                Sum: {formatCurrency(transactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0))}
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
        </div>

        {/* Expenses by Category */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">Expenses by Category</h2>
          <p className="text-sm text-gray-500 mb-4">
            Click on a category to see individual transactions. "Uncategorized" means transactions that haven't been assigned a category yet.
          </p>
          {data.expensesByCategory.length === 0 ? (
            <p className="text-gray-500">No expenses recorded for this period</p>
          ) : (
            <div className="space-y-2">
              {data.expensesByCategory.filter((cat) => cat.name !== "Transfer").map((cat) => {
                const key = `expense-${cat.categoryId || "uncategorized"}`;
                const isExpanded = expandedCategories.has(key);
                const transactions = categoryTransactions[key] || [];

                return (
                  <div key={cat.categoryId || "uncategorized"} className="border rounded-lg">
                    <button
                      onClick={() => toggleCategory(cat.categoryId, false)}
                      className="w-full flex justify-between items-center p-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">{isExpanded ? "▼" : "▶"}</span>
                        <div>
                          <span className="text-gray-700 font-medium">{cat.name}</span>
                          {isExpanded && transactions.length > 0 && (
                            <span className="ml-2 text-xs text-gray-500">({transactions.length} transactions)</span>
                          )}
                        </div>
                      </div>
                      <span className="font-medium text-red-600">{formatCurrency(cat.total)}</span>
                    </button>

                    {isExpanded && (
                      <div className="border-t bg-gray-50">
                        {transactions.length === 0 ? (
                          <p className="p-4 text-sm text-gray-500">Loading transactions...</p>
                        ) : (
                          <>
                            <div className="divide-y">
                              {transactions.map((tx) => (
                                <div
                                  key={tx.id}
                                  className="p-3 hover:bg-gray-100 cursor-pointer transition-colors"
                                  onClick={() => setSelectedTransaction(tx)}
                                >
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium text-gray-900 truncate">{tx.name}</div>
                                      <div className="text-xs text-gray-500">
                                        {new Date(tx.date).toLocaleDateString()} · {tx.account.name}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <select
                                        value={tx.categoryId ?? ""}
                                        onChange={(e) => {
                                          e.stopPropagation();
                                          updateTransactionCategory(tx.id, e.target.value || null, key);
                                        }}
                                        className="text-xs border rounded px-2 py-1 flex-1 sm:flex-initial"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <option value="">Uncategorized</option>
                                        {allCategories.map((c) => (
                                          <option key={c.id} value={c.id}>
                                            {c.name}
                                          </option>
                                        ))}
                                      </select>
                                      <span className="text-sm font-medium text-red-600 whitespace-nowrap">
                                        {formatCurrency(tx.amount)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="p-3 border-t bg-gray-100 text-xs text-gray-600 flex justify-between">
                              <span>Showing {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}</span>
                              <span>Sum: {formatCurrency(transactions.reduce((sum, tx) => sum + tx.amount, 0))}</span>
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
        </div>
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
