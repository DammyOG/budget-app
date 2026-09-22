import { useEffect, useState } from "react";
import {
  api,
  Budget,
  Category,
  centsToDollars,
  currentMonth,
  DashboardSummary,
  dollarsToCents,
  formatCurrency,
} from "../lib/api";
import {
  Button,
  Card,
  EmptyState,
  HeroStat,
  MonthStepper,
  PageHeader,
  Progress,
  Sheet,
  Stat,
  StatGrid,
} from "../components/ui";

interface BudgetStatus {
  category: Category;
  budgeted: number;
  spent: number;
  remaining: number;
  percentage: number;
  over: boolean;
}

export default function Budgets() {
  const [month, setMonth] = useState(currentMonth());
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  // The category currently open in the edit sheet, plus the in-progress value.
  const [editing, setEditing] = useState<Category | null>(null);
  const [draft, setDraft] = useState("");
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.getCategories().then(setCategories);
    api.getBudgets(month).then(setBudgets);
    api.getDashboardSummary(month).then(setSummary);
  };

  useEffect(load, [month]);

  const spentFor = (categoryId: string) =>
    summary?.spendingByCategory.find((s) => s.categoryId === categoryId)?.total || 0;

  const budgetFor = (categoryId: string) => budgets.find((b) => b.categoryId === categoryId);

  const openEditor = (category: Category) => {
    setEditing(category);
    // The field is in dollars; the stored value is cents.
    const existing = budgetFor(category.id);
    setDraft(existing ? String(centsToDollars(existing.amountCents)) : "");
    setPicking(false);
  };

  const save = async () => {
    if (!editing) return;
    const dollars = Number(draft);
    if (draft === "" || Number.isNaN(dollars) || dollars < 0) return;
    setSaving(true);
    try {
      await api.setBudget(editing.id, month, dollarsToCents(dollars));
      load();
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    if (!editing) return;
    const existing = budgetFor(editing.id);
    if (!existing) return setEditing(null);
    setSaving(true);
    try {
      await api.deleteBudget(existing.id);
      load();
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  // Only categories that actually have a budget. Listing all 18 spending
  // categories inline meant a dozen dead "Set budget" rows and a 5,300px page
  // on a phone; the unbudgeted ones now live behind "Add a budget".
  const statuses: BudgetStatus[] = budgets
    .map((b) => {
      const category = categories.find((c) => c.id === b.categoryId);
      if (!category) return null;
      const spent = spentFor(category.id);
      const percentage = b.amountCents > 0 ? (spent / b.amountCents) * 100 : 0;
      return {
        category,
        budgeted: b.amountCents,
        spent,
        remaining: b.amountCents - spent,
        percentage,
        over: spent > b.amountCents,
      };
    })
    .filter((s): s is BudgetStatus => s !== null)
    .sort((a, b) => b.percentage - a.percentage);

  const unbudgeted = categories.filter((c) => !c.isIncome && !budgetFor(c.id));

  const totalBudgeted = statuses.reduce((s, b) => s + b.budgeted, 0);
  const totalSpent = statuses.reduce((s, b) => s + b.spent, 0);
  const totalRemaining = totalBudgeted - totalSpent;
  const overCount = statuses.filter((s) => s.over).length;
  const warnCount = statuses.filter((s) => !s.over && s.percentage >= 75).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Budgets"
        action={
          <Button variant="primary" size="sm" onClick={() => setPicking(true)}>
            + Add
          </Button>
        }
      />

      <MonthStepper month={month} onChange={setMonth} />

      {overCount > 0 && (
        <Card className="border-red-200 bg-red-50">
          <div className="flex items-start gap-2 text-sm">
            <span>🚨</span>
            <p className="text-red-800">
              <span className="font-medium">
                {overCount} {overCount === 1 ? "category is" : "categories are"} over budget
              </span>{" "}
              this month.
            </p>
          </div>
        </Card>
      )}
      {warnCount > 0 && overCount === 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <div className="flex items-start gap-2 text-sm">
            <span>⚠️</span>
            <p className="text-amber-800">
              {warnCount} {warnCount === 1 ? "category is" : "categories are"} close to the limit.
            </p>
          </div>
        </Card>
      )}

      {statuses.length === 0 ? (
        <EmptyState
          icon="🎯"
          title="No budgets set for this month"
          hint="Pick a category and set a monthly limit. Spending is tracked against it automatically."
        />
      ) : (
        <>
          {/* What's left is the number you check mid-month, so it leads. */}
          <HeroStat
            label="Left to spend"
            value={formatCurrency(totalRemaining)}
            tone={totalRemaining < 0 ? "negative" : "neutral"}
          >
            <div className="mt-3 border-t pt-3">
              <Progress pct={totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0} over={totalSpent > totalBudgeted} />
              <div className="mt-1.5 flex justify-between text-xs text-slate-500">
                <span className="tabular-nums">{formatCurrency(totalSpent)} spent</span>
                <span className="tabular-nums">of {formatCurrency(totalBudgeted)}</span>
              </div>
            </div>
          </HeroStat>

          <div className="space-y-2">
            {statuses.map((s) => (
              // The whole row is the tap target — the old layout put a number
              // input, a Clear link and three right-aligned columns in one
              // row, which ran off the screen edge on a phone.
              <button
                key={s.category.id}
                onClick={() => openEditor(s.category)}
                className="block w-full rounded-2xl border border-slate-200 bg-white p-4 text-left active:bg-slate-50"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">{s.category.name}</span>
                  <span
                    className={`shrink-0 text-sm font-semibold tabular-nums ${
                      s.over ? "text-red-600" : "text-slate-900"
                    }`}
                  >
                    {formatCurrency(Math.abs(s.remaining))}
                    <span className="ml-1 text-xs font-normal text-slate-400">{s.over ? "over" : "left"}</span>
                  </span>
                </div>
                <div className="mt-2">
                  <Progress pct={s.percentage} over={s.over} />
                </div>
                <div className="mt-1.5 flex justify-between text-xs text-slate-500">
                  <span className="tabular-nums">
                    {formatCurrency(s.spent)} of {formatCurrency(s.budgeted)}
                  </span>
                  <span className="tabular-nums">{s.percentage.toFixed(0)}%</span>
                </div>
              </button>
            ))}
          </div>

          <StatGrid>
            <Stat label="Budgeted" value={formatCurrency(totalBudgeted)} />
            <Stat
              label="Spent"
              value={formatCurrency(totalSpent)}
              tone={totalSpent > totalBudgeted ? "negative" : "neutral"}
              hint={totalBudgeted > 0 ? `${((totalSpent / totalBudgeted) * 100).toFixed(0)}% of budget` : undefined}
            />
          </StatGrid>
        </>
      )}

      <Sheet open={picking} onClose={() => setPicking(false)} title="Add a budget">
        {unbudgeted.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">Every category already has a budget this month.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {unbudgeted.map((c) => (
              <button
                key={c.id}
                onClick={() => openEditor(c)}
                className="flex min-h-[48px] items-center justify-between rounded-xl px-3 text-sm font-medium text-slate-700 active:bg-slate-100"
              >
                <span className="truncate">{c.name}</span>
                <span className="shrink-0 text-xs text-slate-400 tabular-nums">
                  {formatCurrency(spentFor(c.id))} spent
                </span>
              </button>
            ))}
          </div>
        )}
      </Sheet>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.name ?? ""}>
        <label className="block text-sm font-medium text-slate-700">Monthly limit</label>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-lg text-slate-400">$</span>
          <input
            type="number"
            inputMode="decimal"
            step="1"
            min="0"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="0"
            className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3 text-lg tabular-nums"
          />
        </div>
        {editing && (
          <p className="mt-2 text-sm text-slate-500 tabular-nums">
            {formatCurrency(spentFor(editing.id))} spent in {new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" })}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <Button variant="primary" className="flex-1" onClick={save} disabled={saving || draft === ""}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {editing && budgetFor(editing.id) && (
            <Button variant="danger" onClick={clear} disabled={saving}>
              Remove
            </Button>
          )}
        </div>
      </Sheet>
    </div>
  );
}
