import { useEffect, useState } from "react";
import {
  api,
  formatCurrency,
  formatSignedAmount,
  formatTransactionDate,
  type RecurringTransaction,
  type RecurringStats,
  isOutflow,
} from "../lib/api";
import { Button, Card, EmptyState, HeroStat, PageHeader, Spinner, StatRow } from "../components/ui";

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

  if (loading) return <Spinner />;

  if (error) {
    return (
      <div>
        <PageHeader title="Recurring" />
        <Card className="border-red-200 bg-red-50 text-sm text-red-700">{error}</Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Recurring"
        subtitle="Subscriptions and bills found in your history"
        action={
          <Button size="sm" onClick={loadData}>
            🔄
          </Button>
        }
      />

      {stats && (
        <>
          <HeroStat label="Monthly recurring cost" value={formatCurrency(stats.totalRecurringMonthlyEquivalent)}>
            <p className="mt-1 text-xs text-slate-400">All frequencies converted to a monthly equivalent</p>
          </HeroStat>
          <StatRow
            items={[
              { label: "Detected", value: String(stats.total) },
              { label: "Monthly", value: String(stats.monthlySubscriptions) },
              { label: "Subs cost", value: formatCurrency(stats.totalMonthlyExpenses), tone: "negative" },
            ]}
          />
        </>
      )}

      <details className="rounded-2xl border border-blue-200 bg-blue-50">
        <summary className="flex min-h-[44px] cursor-pointer items-center px-4 text-sm font-medium text-blue-900">
          📊 How this is detected
        </summary>
        <p className="px-4 pb-4 text-sm text-blue-800">
          Transactions with the same name that occur at regular intervals (weekly, monthly, and so on) are grouped
          automatically. It takes at least three instances before a pattern is recognized.
        </p>
      </details>

      {recurring.length === 0 ? (
        <EmptyState
          icon="🔁"
          title="Nothing recurring yet"
          hint="It takes at least 3 instances of the same transaction at regular intervals before a pattern shows up here."
        />
      ) : (
        <div className="space-y-3">
          {recurring.map((item) => {
            const isExpanded = expandedItems.has(item.name);
            const daysUntil = getDaysUntil(item.nextExpectedDate);
            const upcoming = isUpcoming(item.nextExpectedDate);

            return (
              <div
                key={item.name}
                className={`overflow-hidden rounded-2xl border bg-white ${
                  upcoming ? "border-amber-300 ring-1 ring-amber-300" : "border-slate-200"
                }`}
              >
                {/* Name, a due badge, five metadata chips and a two-line
                    amount column all on one row left every chip clipped at
                    phone width. Name and amount now own the first row; the
                    details wrap onto the second. */}
                <button
                  onClick={() => toggleExpand(item.name)}
                  className="w-full p-4 text-left transition-colors active:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="shrink-0 text-slate-400">{isExpanded ? "▾" : "▸"}</span>
                      <span className="truncate font-medium">{item.name}</span>
                    </div>
                    <div className="shrink-0 text-right">
                      <div
                        className={`font-semibold tabular-nums ${
                          item.averageAmount > 0 ? "text-red-600" : "text-emerald-600"
                        }`}
                      >
                        {formatCurrency(item.averageAmount)}
                      </div>
                      <div className="text-[11px] text-slate-400">avg</div>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 pl-6 text-xs text-slate-500">
                    <span className={`rounded-full px-2 py-0.5 font-medium ${getFrequencyColor(item.frequency)}`}>
                      {getFrequencyLabel(item.frequency)}
                    </span>
                    {upcoming && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                        Due {daysUntil === 0 ? "today" : daysUntil === 1 ? "tomorrow" : `in ${daysUntil}d`}
                      </span>
                    )}
                    {item.categoryName && <span className="truncate">📁 {item.categoryName}</span>}
                    <span>{item.count}×</span>
                    <span>Next {formatTransactionDate(item.nextExpectedDate)}</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t bg-slate-50 p-4">
                    <h3 className="mb-3 text-sm font-medium text-slate-700">History ({item.count})</h3>
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
                                // Stored at UTC midnight; without this it renders a day early.
                                timeZone: "UTC",
                              })}
                            </div>
                            <div className="text-xs text-gray-500">{tx.accountName}</div>
                          </div>
                          <div className={`font-medium ${isOutflow(tx.amount) ? "text-red-600" : "text-green-600"}`}>
                            {formatSignedAmount(tx.amount)}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Summary */}
                    <div className="mt-4 grid grid-cols-3 gap-2 border-t pt-4 text-sm">
                      <div className="min-w-0">
                        <div className="truncate text-xs text-slate-500">Total</div>
                        <div className="truncate font-semibold tabular-nums">
                          {formatCurrency(item.transactions.reduce((sum, tx) => sum + tx.amount, 0))}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-xs text-slate-500">Average</div>
                        <div className="truncate font-semibold tabular-nums">
                          {formatCurrency(item.averageAmount)}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-xs text-slate-500">Per month</div>
                        <div className="truncate font-semibold tabular-nums">
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
