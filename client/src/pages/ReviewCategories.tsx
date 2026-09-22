import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Category, formatCurrency, formatTransactionDate, TeachQueue } from "../lib/api";
import { useToast } from "../components/ToastProvider";
import { Button, Card, EmptyState, PageHeader, Progress, Spinner, StatRow } from "../components/ui";

// Reviewing one transaction at a time meant answering the same merchant over
// and over — twelve Amazon charges were twelve separate questions with the
// same answer, and each answer only ever fixed the single row in front of you.
//
// This asks about merchants instead, worst backlog first, and every answer
// applies to every matching transaction and to everything that arrives later.

// Merchant keys are upper-case because bank descriptors are; shouting the
// merchant name back at the user isn't necessary.
function titleCase(key: string): string {
  return key
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function ReviewCategories() {
  const toast = useToast();
  const [queue, setQueue] = useState<TeachQueue | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [taught, setTaught] = useState({ merchants: 0, transactions: 0 });

  async function load() {
    setLoading(true);
    try {
      const [q, cats] = await Promise.all([api.getTeachQueue(25), api.getCategories()]);
      setQueue(q);
      setCategories(cats);
    } catch (err: any) {
      toast.error(`Failed to load: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Skipping shouldn't re-ask immediately; it moves to the back for this
  // session rather than being recorded as an answer.
  const pending = (queue?.merchants ?? []).filter((m) => !skipped.includes(m.merchantKey));
  const current = pending[0];

  async function teach(categoryId: string) {
    if (!current) return;
    setSaving(true);
    try {
      const { applied } = await api.teachMerchant(current.sampleName, categoryId);
      setTaught((t) => ({ merchants: t.merchants + 1, transactions: t.transactions + applied }));
      toast.success(
        applied === 1 ? "Categorized 1 transaction" : `Categorized ${applied} transactions from this merchant`
      );
      setPicking(false);
      await load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading && !queue) return <Spinner label="Working out what to ask…" />;

  if (!queue) return null;

  const coveragePct = Math.round(queue.coverage * 100);

  if (!current) {
    return (
      <div className="space-y-4">
        <PageHeader title="Review" />
        <EmptyState
          icon={queue.uncategorizedTransactions === 0 ? "🎉" : "👍"}
          title={queue.uncategorizedTransactions === 0 ? "Everything is categorized" : "Nothing left to ask about"}
          hint={
            queue.uncategorizedTransactions === 0 ? (
              <>
                All {coveragePct}% of your spending is categorized. New transactions get sorted automatically using
                what you've taught it.
              </>
            ) : (
              <>
                You skipped the rest. <button onClick={() => setSkipped([])} className="font-medium text-indigo-600 underline">Show them again</button>
              </>
            )
          }
        />
        {taught.merchants > 0 && (
          <StatRow
            items={[
              { label: "Merchants taught", value: String(taught.merchants) },
              { label: "Transactions fixed", value: String(taught.transactions), tone: "positive" },
              { label: "Categorized", value: `${coveragePct}%`, tone: "positive" },
            ]}
          />
        )}
        <Link
          to="/transactions"
          className="flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 text-sm font-medium"
        >
          Back to transactions
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Review" subtitle="Answer once per merchant, not once per transaction" />

      <Card>
        <div className="mb-1.5 flex justify-between text-xs text-slate-500">
          <span>{coveragePct}% of your spending is categorized</span>
          <span>
            {queue.uncategorizedMerchants} merchant{queue.uncategorizedMerchants === 1 ? "" : "s"} left
          </span>
        </div>
        <Progress pct={coveragePct} />
        <p className="mt-2 text-xs text-slate-400">
          {queue.uncategorizedTransactions} transaction
          {queue.uncategorizedTransactions === 1 ? "" : "s"} still uncategorized. These are ordered by how much
          each answer clears up.
        </p>
      </Card>

      <Card>
        <div className="mb-3 border-b pb-3">
          {/* The normalized merchant reads as a name; the raw descriptor is
              kept underneath so you can still recognize the charge on a
              statement. Leading with "AMAZON.COM*P8821 AMZN.COM/BILL WA" made
              the question harder to answer than it needed to be. */}
          <h2 className="break-words text-lg font-bold">{titleCase(current.merchantKey)}</h2>
          <p className="mt-0.5 break-all text-xs text-slate-400">{current.sampleName}</p>
          <p className="mt-1.5 text-sm text-slate-500">
            {current.count} transaction{current.count === 1 ? "" : "s"} ·{" "}
            <span className="tabular-nums">{formatCurrency(current.totalAmount)}</span> total
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            {current.accountName} · most recent {formatTransactionDate(current.lastDate)}
          </p>
        </div>

        {/* The model's own guess, with why it thinks so. Shown rather than
            applied, because below the auto-apply threshold it is a suggestion
            and should read like one. */}
        {current.guess && !picking && (
          <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
            <div className="text-xs text-indigo-700">
              Looks like <span className="font-semibold">{current.guess.categoryName}</span> (
              {Math.round(current.guess.confidence * 100)}% sure)
            </div>
            <div className="mt-0.5 text-xs text-indigo-500">{current.guess.reason}</div>
            <Button
              variant="primary"
              size="sm"
              className="mt-2 w-full"
              disabled={saving}
              onClick={() => teach(current.guess!.categoryId)}
            >
              {saving ? "Saving…" : `Yes, it's ${current.guess.categoryName}`}
            </Button>
          </div>
        )}

        {picking || !current.guess ? (
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Which category?
              <select
                // Keyed on the merchant so it remounts between questions.
                // Without this, React reuses the element and the previous
                // answer stays selected on the next merchant — which reads as
                // though that category had already been chosen for it.
                key={current.merchantKey}
                autoFocus
                defaultValue=""
                disabled={saving}
                onChange={(e) => e.target.value && teach(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3"
              >
                <option value="">Choose a category…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {current.guess && (
              <Button className="mt-3 w-full" onClick={() => setPicking(false)} disabled={saving}>
                Back
              </Button>
            )}
          </div>
        ) : (
          <Button className="w-full" onClick={() => setPicking(true)} disabled={saving}>
            No, pick a different category
          </Button>
        )}

        <button
          onClick={() => setSkipped((s) => [...s, current.merchantKey])}
          disabled={saving}
          className="mt-3 min-h-[44px] w-full text-center text-sm text-slate-500 underline"
        >
          Skip this merchant
        </button>
      </Card>

      {taught.merchants > 0 && (
        <StatRow
          items={[
            { label: "Taught", value: String(taught.merchants) },
            { label: "Fixed", value: String(taught.transactions), tone: "positive" },
            { label: "Left", value: String(pending.length) },
          ]}
        />
      )}
    </div>
  );
}
