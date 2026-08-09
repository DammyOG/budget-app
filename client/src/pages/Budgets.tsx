import { useEffect, useState } from "react";
import { api, Budget, Category, currentMonth, DashboardSummary, formatCurrency } from "../lib/api";

type AlertLevel = "safe" | "warning" | "danger" | "exceeded";

interface BudgetStatus {
  category: Category;
  budgeted: number;
  spent: number;
  remaining: number;
  percentage: number;
  alertLevel: AlertLevel;
}

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
    const raw = drafts[categoryId];
    if (raw === undefined || raw === "") return;

    const amount = Number(raw);
    if (Number.isNaN(amount) || amount < 0) return;

    // Skip the write (and the refetches it triggers) when blurring a field that
    // wasn't changed. Compares against the saved budget rather than testing
    // truthiness, because 0 is a real budget — "spend nothing here".
    const existing = budgets.find((b) => b.categoryId === categoryId);
    if (existing && existing.amount === amount) return;

    await api.setBudget(categoryId, month, amount);
    load();
  };

  function getAlertLevel(percentage: number): AlertLevel {
    if (percentage >= 100) return "exceeded";
    if (percentage >= 90) return "danger";
    if (percentage >= 75) return "warning";
    return "safe";
  }

  function getProgressBarColor(alertLevel: AlertLevel): string {
    switch (alertLevel) {
      case "safe":
        return "bg-green-500";
      case "warning":
        return "bg-yellow-500";
      case "danger":
        return "bg-orange-500";
      case "exceeded":
        return "bg-red-500";
    }
  }

  function getAlertBadge(alertLevel: AlertLevel, percentage: number): { text: string; color: string } | null {
    switch (alertLevel) {
      case "exceeded":
        return { text: `${percentage.toFixed(0)}% Over Budget!`, color: "bg-red-100 text-red-800 border-red-200" };
      case "danger":
        return { text: `${percentage.toFixed(0)}% Used - Critical!`, color: "bg-orange-100 text-orange-800 border-orange-200" };
      case "warning":
        return { text: `${percentage.toFixed(0)}% Used`, color: "bg-yellow-100 text-yellow-800 border-yellow-200" };
      default:
        return null;
    }
  }

  function getBudgetStatuses(): BudgetStatus[] {
    return categories
      .filter((c) => !c.isIncome && drafts[c.id] && Number(drafts[c.id]) > 0)
      .map((category) => {
        const budgeted = Number(drafts[category.id] || 0);
        const spent = spentFor(category.id);
        const remaining = budgeted - spent;
        const percentage = budgeted > 0 ? (spent / budgeted) * 100 : 0;
        const alertLevel = getAlertLevel(percentage);

        return {
          category,
          budgeted,
          spent,
          remaining,
          percentage,
          alertLevel,
        };
      });
  }

  const budgetStatuses = getBudgetStatuses();
  const totalBudgeted = budgetStatuses.reduce((sum, b) => sum + b.budgeted, 0);
  const totalSpent = budgetStatuses.reduce((sum, b) => sum + b.spent, 0);
  const totalRemaining = totalBudgeted - totalSpent;
  const overBudgetCount = budgetStatuses.filter((b) => b.alertLevel === "exceeded").length;
  const warningCount = budgetStatuses.filter((b) => b.alertLevel === "danger" || b.alertLevel === "warning").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Budget Tracker</h1>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded border px-3 py-1.5 text-sm"
        />
      </div>

      {/* Alert Notifications */}
      {overBudgetCount > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <span className="text-2xl">🚨</span>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Budget Alert!</h3>
              <p className="text-sm text-red-700 mt-1">
                You have {overBudgetCount} {overBudgetCount === 1 ? "category" : "categories"} over budget this month.
              </p>
            </div>
          </div>
        </div>
      )}

      {warningCount > 0 && overBudgetCount === 0 && (
        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <span className="text-2xl">⚠️</span>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">Warning</h3>
              <p className="text-sm text-yellow-700 mt-1">
                {warningCount} {warningCount === 1 ? "category is" : "categories are"} approaching the budget limit.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      {budgetStatuses.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-500 mb-1">Total Budgeted</div>
            <div className="text-3xl font-bold text-indigo-600">{formatCurrency(totalBudgeted)}</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-500 mb-1">Total Spent</div>
            <div className={`text-3xl font-bold ${totalSpent > totalBudgeted ? "text-red-600" : "text-green-600"}`}>
              {formatCurrency(totalSpent)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {totalBudgeted > 0 ? `${((totalSpent / totalBudgeted) * 100).toFixed(0)}% of budget` : ""}
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-500 mb-1">Remaining</div>
            <div className={`text-3xl font-bold ${totalRemaining < 0 ? "text-red-600" : "text-blue-600"}`}>
              {formatCurrency(totalRemaining)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {overBudgetCount > 0 && `${overBudgetCount} over budget`}
            </div>
          </div>
        </div>
      )}

      {/* Budgets with Progress Bars */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b bg-gray-50">
          <h2 className="font-semibold text-gray-900">Budget Categories</h2>
          <p className="text-sm text-gray-500 mt-1">Set budgets for each category and track your spending</p>
        </div>

        <div className="divide-y">
          {categories
            .filter((c) => !c.isIncome)
            .map((c) => {
              const spent = spentFor(c.id);
              const budgeted = Number(drafts[c.id] || 0);
              const remaining = budgeted - spent;
              const percentage = budgeted > 0 ? (spent / budgeted) * 100 : 0;
              const alertLevel = getAlertLevel(percentage);
              const alertBadge = getAlertBadge(alertLevel, percentage);
              const hasBudget = budgeted > 0;

              return (
                <div key={c.id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3 flex-1">
                      <span className="font-medium text-gray-900">{c.name}</span>
                      {alertBadge && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${alertBadge.color}`}>
                          {alertBadge.text}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm text-gray-500">Budget</div>
                        <input
                          type="number"
                          step="1"
                          value={drafts[c.id] ?? ""}
                          onChange={(e) => setDrafts({ ...drafts, [c.id]: e.target.value })}
                          onBlur={() => save(c.id)}
                          className="w-28 rounded border px-2 py-1 text-sm text-right"
                          placeholder="Set budget"
                        />
                      </div>
                      {hasBudget && (
                        <>
                          <div className="text-right">
                            <div className="text-sm text-gray-500">Spent</div>
                            <div className="text-sm font-semibold">{formatCurrency(spent)}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm text-gray-500">Remaining</div>
                            <div className={`text-sm font-semibold ${remaining < 0 ? "text-red-600" : "text-green-600"}`}>
                              {formatCurrency(remaining)}
                            </div>
                          </div>
                        </>
                      )}
                      {budgets.find((b) => b.categoryId === c.id) && (
                        <button
                          onClick={async () => {
                            const b = budgets.find((b) => b.categoryId === c.id)!;
                            await api.deleteBudget(b.id);
                            load();
                          }}
                          className="text-xs text-gray-400 hover:text-red-600 px-2"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {hasBudget && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-gray-600">
                        <span>{percentage.toFixed(1)}% used</span>
                        <span>
                          {formatCurrency(spent)} / {formatCurrency(budgeted)}
                        </span>
                      </div>
                      <div className="h-3 rounded-full bg-gray-200 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${getProgressBarColor(alertLevel)}`}
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* Help Text */}
      {budgetStatuses.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <p className="text-blue-900 font-medium mb-2">💡 Get Started with Budgets</p>
          <p className="text-sm text-blue-800">
            Set a budget amount for each category above. We'll track your spending and alert you when you're
            approaching or exceeding your limits.
          </p>
        </div>
      )}
    </div>
  );
}
