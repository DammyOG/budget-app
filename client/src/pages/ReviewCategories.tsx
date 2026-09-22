import { useEffect, useState } from "react";
import { api, formatSignedAmount, formatTransactionDate, Transaction, Category } from "../lib/api";
import { Link } from "react-router-dom";
import { useToast } from "../components/ToastProvider";
import { Button, EmptyState, PageHeader, Spinner, StatRow } from "../components/ui";

export default function ReviewCategories() {
  const toast = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showCustomCategory, setShowCustomCategory] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [stats, setStats] = useState({ reviewed: 0, corrected: 0, total: 0 });
  const [accountCount, setAccountCount] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [{ transactions: txs }, cats, accts] = await Promise.all([
        // Review needs the full set to prioritize uncategorized rows across
        // everything, not just the most recent page.
        api.getTransactions({ limit: "100000" }),
        api.getCategories(),
        // Only to tell "you have no accounts" apart from "your accounts have
        // no transactions" in the empty state.
        api.getAccounts(),
      ]);
      setAccountCount(accts.length);

      // Get all transactions, prioritize uncategorized
      const uncategorized = txs.filter((t) => !t.categoryId);
      const categorized = txs.filter((t) => t.categoryId);

      setTransactions([...uncategorized, ...categorized]);
      setCategories(cats);
      setStats({ reviewed: 0, corrected: 0, total: txs.length });
    } catch (err: any) {
      toast.error(`Failed to load: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  const currentTransaction = transactions[currentIndex];
  const hasMore = currentIndex < transactions.length - 1;
  const progress = transactions.length > 0 ? ((currentIndex / transactions.length) * 100) : 0;

  async function handleCorrect() {
    if (!currentTransaction) return;

    setStats((s) => ({ ...s, reviewed: s.reviewed + 1 }));

    if (hasMore) {
      setCurrentIndex(currentIndex + 1);
    } else {
      showCompletionMessage();
    }
  }

  async function handleWrong() {
    setShowCustomCategory(true);
  }

  async function submitCorrection() {
    if (!currentTransaction || !selectedCategoryId) return;

    setProcessing(true);
    try {
      await api.updateTransaction(currentTransaction.id, {
        categoryId: selectedCategoryId,
      });

      setStats((s) => ({ ...s, reviewed: s.reviewed + 1, corrected: s.corrected + 1 }));
      setShowCustomCategory(false);
      setSelectedCategoryId("");

      if (hasMore) {
        setCurrentIndex(currentIndex + 1);
      } else {
        showCompletionMessage();
      }
    } catch (err: any) {
      toast.error(`Failed to update: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  }

  function showCompletionMessage() {
    const reviewed = stats.reviewed + 1;
    const accuracy = reviewed > 0 ? (((reviewed - stats.corrected) / reviewed) * 100).toFixed(1) : "0";
    toast.success(`Review complete — ${reviewed} reviewed, ${stats.corrected} corrected, ${accuracy}% accuracy.`);
    loadData();
    setCurrentIndex(0);
  }

  function skip() {
    if (hasMore) {
      setCurrentIndex(currentIndex + 1);
    }
  }

  if (loading) return <Spinner label="Loading transactions…" />;

  if (transactions.length === 0) {
    return (
      <div>
        <PageHeader title="Review" />
        {/* This page needs transactions, not accounts. Saying "link an
            account" to someone who already has them — and can see a net
            worth built from them on the dashboard — points at the wrong
            problem. */}
        <EmptyState
          icon="📭"
          title="Nothing to review"
          hint={
            accountCount === 0 ? (
              <>
                Link a bank on the{" "}
                <Link to="/accounts" className="font-medium text-indigo-600">
                  Accounts
                </Link>{" "}
                page first.
              </>
            ) : (
              <>
                There are no transactions to review yet. Balances and transaction history are separate, so your
                accounts can show a net worth before any history arrives — try syncing from{" "}
                <Link to="/transactions" className="font-medium text-indigo-600">
                  Transactions
                </Link>
                .
              </>
            )
          }
        />
      </div>
    );
  }

  if (!currentTransaction) {
    return (
      <div>
        <PageHeader title="Review" />
        <EmptyState icon="🎉" title="All done!" hint="You've reviewed every transaction." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Review" subtitle="Confirm or correct one transaction at a time" />

      <div>
        <div className="mb-1.5 flex justify-between text-xs text-slate-500">
          <span>
            {currentIndex + 1} of {transactions.length}
          </span>
          <span>{progress.toFixed(0)}% complete</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full bg-indigo-600 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <StatRow
        items={[
          { label: "Reviewed", value: String(stats.reviewed) },
          { label: "Corrected", value: String(stats.corrected) },
          { label: "Left", value: String(transactions.length - currentIndex) },
        ]}
      />

      {/* Transaction Card */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {/* Name and a 30px amount side by side left the name about 120px of
            width on a phone. Stacked, each gets the full line. */}
        <div className="border-b bg-slate-50 p-4">
          <h2 className="break-words text-lg font-bold">{currentTransaction.name}</h2>
          {currentTransaction.merchantName && currentTransaction.merchantName !== currentTransaction.name && (
            <p className="mt-0.5 text-sm text-slate-500">{currentTransaction.merchantName}</p>
          )}
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold tabular-nums ${
                currentTransaction.kind === "transfer"
                  ? "text-slate-500"
                  : currentTransaction.amount > 0
                  ? "text-red-600"
                  : "text-emerald-600"
              }`}
            >
              {formatSignedAmount(currentTransaction.amount)}
            </span>
            <span className="text-xs text-slate-500">
              {currentTransaction.kind === "transfer"
                ? "Transfer"
                : currentTransaction.kind === "income"
                ? "Income"
                : currentTransaction.amount < 0
                ? "Refund"
                : "Expense"}
            </span>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-4 p-4">
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-slate-500">Date</span>
            <span className="font-medium">{formatTransactionDate(currentTransaction.date)}</span>
          </div>
          <div className="flex justify-between gap-3 text-sm">
            <span className="shrink-0 text-slate-500">Account</span>
            <span className="truncate font-medium">{currentTransaction.account.name}</span>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-1.5 text-xs text-slate-500">Current category</div>
            {currentTransaction.category ? (
              <span className="inline-block rounded-lg border border-indigo-200 bg-white px-3 py-1.5 font-semibold text-indigo-900">
                {currentTransaction.category.name}
              </span>
            ) : (
              <span className="inline-block rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 font-semibold text-amber-800">
                ⚠️ Uncategorized
              </span>
            )}
          </div>

          <p className="pt-1 text-center font-semibold">Is this correct?</p>

          {/* The two answers are the whole job on this page, so they get
              full-width 52px targets rather than hover-scale desktop buttons. */}
          {!showCustomCategory ? (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleCorrect}
                className="min-h-[52px] rounded-xl bg-emerald-600 px-4 font-semibold text-white active:bg-emerald-700"
              >
                ✓ Yes
              </button>
              <button
                onClick={handleWrong}
                className="min-h-[52px] rounded-xl bg-red-500 px-4 font-semibold text-white active:bg-red-600"
              >
                ✗ No
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                Pick the correct category
                <select
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3"
                  autoFocus
                >
                  <option value="">Choose a category…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={() => {
                    setShowCustomCategory(false);
                    setSelectedCategoryId("");
                  }}
                >
                  Cancel
                </Button>
                <Button variant="primary" onClick={submitCorrection} disabled={!selectedCategoryId || processing}>
                  {processing ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          )}

          {!showCustomCategory && (
            <button onClick={skip} className="min-h-[44px] w-full text-center text-sm text-slate-500 underline">
              Skip this transaction
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
