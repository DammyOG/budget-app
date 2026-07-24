import { useEffect, useState } from "react";
import { api, formatCurrency, type RecurringTransaction, type RecurringStats } from "../lib/api";

export default function Recurring() {
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [stats, setStats] = useState<RecurringStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [recurringData, statsData] = await Promise.all([
        api.getRecurringTransactions(),
        api.getRecurringStats(),
      ]);
      setRecurring(recurringData);
      setStats(statsData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(name: string) {
    const newExpanded = new Set(expandedItems);
    if (expandedItems.has(name)) {
      newExpanded.delete(name);
    } else {
      newExpanded.add(name);
    }
    setExpandedItems(newExpanded);
  }

  function getFrequencyLabel(frequency: RecurringTransaction["frequency"]): string {
    const labels = {
      weekly: "Weekly",
      biweekly: "Bi-weekly",
      monthly: "Monthly",
      quarterly: "Quarterly",
      yearly: "Yearly",
    };
    return labels[frequency];
  }

  function getFrequencyColor(frequency: RecurringTransaction["frequency"]): string {
    const colors = {
      weekly: "bg-purple-100 text-purple-800",
      biweekly: "bg-blue-100 text-blue-800",
      monthly: "bg-green-100 text-green-800",
      quarterly: "bg-yellow-100 text-yellow-800",
      yearly: "bg-orange-100 text-orange-800",
    };
    return colors[frequency];
  }

  function isUpcoming(nextDate: string): boolean {
    const next = new Date(nextDate);
    const now = new Date();
    const daysUntil = Math.ceil((next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntil >= 0 && daysUntil <= 7;
  }

  function getDaysUntil(nextDate: string): number {
    const next = new Date(nextDate);
    const now = new Date();
    return Math.ceil((next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Recurring Transactions</h1>
        <p>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Recurring Transactions</h1>
        <p className="text-red-600">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Recurring Transactions & Subscriptions</h1>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Info box */}
      <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h2 className="font-semibold text-blue-900 mb-2">📊 How It Works</h2>
        <p className="text-sm text-blue-800">
          This page automatically detects recurring transactions like subscriptions, bills, and regular expenses
          by analyzing patterns in your transaction history. We look for transactions with the same name that occur
          at regular intervals (weekly, monthly, etc.).
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-500 mb-1">Total Recurring</div>
            <div className="text-3xl font-bold text-indigo-600">{stats.total}</div>
            <div className="text-xs text-gray-500 mt-1">transactions detected</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-500 mb-1">Monthly Subscriptions</div>
            <div className="text-3xl font-bold text-green-600">{stats.monthlySubscriptions}</div>
            <div className="text-xs text-gray-500 mt-1">monthly recurring items</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-500 mb-1">Monthly Total</div>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(stats.totalMonthlyExpenses)}
            </div>
            <div className="text-xs text-gray-500 mt-1">monthly subscriptions</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-500 mb-1">All Recurring (Monthly Equiv.)</div>
            <div className="text-2xl font-bold text-orange-600">
              {formatCurrency(stats.totalRecurringMonthlyEquivalent)}
            </div>
            <div className="text-xs text-gray-500 mt-1">all frequencies combined</div>
          </div>
        </div>
      )}

      {/* Recurring Transactions List */}
      {recurring.length === 0 ? (
        <div className="bg-white p-12 rounded-lg shadow text-center">
          <p className="text-gray-500 text-lg">
            No recurring transactions detected yet. You need at least 3 instances of the same transaction
            at regular intervals for it to be detected as recurring.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {recurring.map((item) => {
            const isExpanded = expandedItems.has(item.name);
            const daysUntil = getDaysUntil(item.nextExpectedDate);
            const upcoming = isUpcoming(item.nextExpectedDate);

            return (
              <div
                key={item.name}
                className={`bg-white rounded-lg shadow ${upcoming ? "ring-2 ring-yellow-400" : ""}`}
              >
                <button
                  onClick={() => toggleExpand(item.name)}
                  className="w-full p-4 hover:bg-gray-50 transition-colors rounded-lg text-left"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <span className="text-gray-400 mt-1">{isExpanded ? "▼" : "▶"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900">{item.name}</span>
                          {upcoming && (
                            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded-full font-medium">
                              Due {daysUntil === 0 ? "today" : daysUntil === 1 ? "tomorrow" : `in ${daysUntil} days`}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-sm text-gray-500">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getFrequencyColor(item.frequency)}`}>
                            {getFrequencyLabel(item.frequency)}
                          </span>
                          {item.categoryName && (
                            <span className="text-xs">
                              📁 {item.categoryName}
                            </span>
                          )}
                          <span className="text-xs">
                            {item.count} occurrences
                          </span>
                          <span className="text-xs hidden sm:inline">
                            Last: {new Date(item.lastDate).toLocaleDateString()}
                          </span>
                          <span className="text-xs hidden sm:inline">
                            Next: {new Date(item.nextExpectedDate).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:block sm:text-right sm:ml-4">
                      <div className={`text-lg font-semibold ${item.averageAmount > 0 ? "text-red-600" : "text-green-600"}`}>
                        {formatCurrency(item.averageAmount)}
                      </div>
                      <div className="text-xs text-gray-500">avg per occurrence</div>
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t bg-gray-50 p-4">
                    <h3 className="font-medium text-gray-700 mb-3">Transaction History ({item.count} total)</h3>
                    <div className="space-y-2">
                      {item.transactions.map((tx) => (
                        <div
                          key={tx.id}
                          className="flex justify-between items-center p-3 bg-white rounded border text-sm"
                        >
                          <div>
                            <div className="text-gray-900">
                              {new Date(tx.date).toLocaleDateString("en-US", {
                                weekday: "short",
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })}
                            </div>
                            <div className="text-xs text-gray-500">{tx.accountName}</div>
                          </div>
                          <div className={`font-medium ${tx.amount > 0 ? "text-red-600" : "text-green-600"}`}>
                            {formatCurrency(tx.amount)}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Summary */}
                    <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="text-gray-500">Total Spent</div>
                        <div className="font-semibold text-gray-900">
                          {formatCurrency(item.transactions.reduce((sum, tx) => sum + tx.amount, 0))}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500">Average Amount</div>
                        <div className="font-semibold text-gray-900">
                          {formatCurrency(item.averageAmount)}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500">Monthly Equivalent</div>
                        <div className="font-semibold text-gray-900">
                          {formatCurrency(
                            item.frequency === "weekly"
                              ? item.averageAmount * 4.33
                              : item.frequency === "biweekly"
                              ? item.averageAmount * 2.17
                              : item.frequency === "monthly"
                              ? item.averageAmount
                              : item.frequency === "quarterly"
                              ? item.averageAmount / 3
                              : item.averageAmount / 12
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
