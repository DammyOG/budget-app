import { useEffect, useState } from "react";
import { api, formatCurrency, formatTransactionDate, type TransferPair } from "../lib/api";
import { useToast } from "../components/ToastProvider";
import { Button, Card, EmptyState, PageHeader, Spinner } from "../components/ui";

export default function Transfers() {
  const toast = useToast();
  const [potentialTransfers, setPotentialTransfers] = useState<TransferPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    loadPotentialTransfers();
  }, []);

  async function loadPotentialTransfers() {
    setLoading(true);
    setError(null);
    try {
      const transfers = await api.detectTransfers();
      setPotentialTransfers(transfers);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function linkPair(pair: TransferPair) {
    setLinking(true);
    try {
      await api.linkTransferPair(pair.fromTransaction.id, pair.toTransaction.id);
      // Remove the linked pair from the list
      setPotentialTransfers((prev) =>
        prev.filter(
          (p) =>
            p.fromTransaction.id !== pair.fromTransaction.id && p.toTransaction.id !== pair.toTransaction.id
        )
      );
    } catch (err: any) {
      toast.error(`Failed to link transfer: ${err.message}`);
    } finally {
      setLinking(false);
    }
  }

  async function autoLink() {
    setLinking(true);
    try {
      const result = await api.autoLinkTransfers();
      toast.success(`Auto-linked ${result.linked} high-confidence transfers out of ${result.total} detected.`);
      loadPotentialTransfers();
    } catch (err: any) {
      toast.error(`Failed to auto-link: ${err.message}`);
    } finally {
      setLinking(false);
    }
  }

  function getConfidenceBadgeColor(confidence: "high" | "medium" | "low") {
    switch (confidence) {
      case "high":
        return "bg-green-100 text-green-800";
      case "medium":
        return "bg-yellow-100 text-yellow-800";
      case "low":
        return "bg-gray-100 text-gray-800";
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Transfers" subtitle="Money moving between your own accounts" />

      <Button
        variant="primary"
        className="w-full"
        onClick={autoLink}
        disabled={linking || potentialTransfers.length === 0}
      >
        Auto-link high-confidence pairs
      </Button>

      <details className="rounded-2xl border border-blue-200 bg-blue-50">
        <summary className="flex min-h-[44px] cursor-pointer items-center px-4 text-sm font-medium text-blue-900">
          What are transfer pairs?
        </summary>
        <p className="px-4 pb-4 text-sm text-blue-800">
          Two transactions recording the same movement of money between your accounts — say $1,499 leaving Bank of
          America and arriving at Ally. Linking them stops that one movement being counted as both income and
          spending.
        </p>
      </details>

      {loading && <Spinner label="Looking for transfers…" />}

      {error && <Card className="border-red-200 bg-red-50 text-sm text-red-700">{error}</Card>}

      {!loading && !error && potentialTransfers.length === 0 && (
        <EmptyState icon="⇄" title="Nothing to link" hint="No unlinked transfer pairs were found." />
      )}

      {!loading && !error && potentialTransfers.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Found {potentialTransfers.length} possible pair{potentialTransfers.length !== 1 ? "s" : ""}.
          </p>

          {potentialTransfers.map((pair) => (
            <Card key={`${pair.fromTransaction.id}-${pair.toTransaction.id}`}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${getConfidenceBadgeColor(
                    pair.confidence
                  )}`}
                >
                  {pair.confidence} confidence
                </span>
                <Button size="sm" variant="primary" onClick={() => linkPair(pair)} disabled={linking}>
                  Link
                </Button>
              </div>

              {/* Stacked on a phone with an arrow between: side-by-side
                  panels gave each leg ~160px, not enough for a merchant
                  name and an account name. */}
              <div className="space-y-2">
                <div className="rounded-xl bg-red-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-red-900">From</div>
                  <div className="mt-1 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{pair.fromTransaction.name}</div>
                      <div className="truncate text-xs text-slate-600">
                        {pair.fromTransaction.accountName} · {formatTransactionDate(pair.fromTransaction.date)}
                      </div>
                    </div>
                    <div className="shrink-0 font-bold tabular-nums text-red-600">
                      -{formatCurrency(pair.fromTransaction.amount)}
                    </div>
                  </div>
                </div>

                <div className="text-center text-slate-400">↓</div>

                <div className="rounded-xl bg-emerald-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-900">To</div>
                  <div className="mt-1 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{pair.toTransaction.name}</div>
                      <div className="truncate text-xs text-slate-600">
                        {pair.toTransaction.accountName} · {formatTransactionDate(pair.toTransaction.date)}
                      </div>
                    </div>
                    <div className="shrink-0 font-bold tabular-nums text-emerald-600">
                      +{formatCurrency(pair.toTransaction.amount)}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
