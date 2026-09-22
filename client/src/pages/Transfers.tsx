import { useEffect, useMemo, useState } from "react";
import {
  api,
  formatCurrency,
  formatTransactionDate,
  type LinkedPair,
  type TransferPair,
  type UnmatchedFlow,
} from "../lib/api";
import { useToast } from "../components/ToastProvider";
import { Button, Card, EmptyState, PageHeader, Segmented, Sheet, Spinner } from "../components/ui";

type Tab = "suggested" | "manual" | "matched";

function confidenceClass(c: TransferPair["confidence"]): string {
  return c === "high"
    ? "bg-emerald-100 text-emerald-800"
    : c === "medium"
    ? "bg-amber-100 text-amber-800"
    : "bg-slate-100 text-slate-700";
}

// One leg of a movement, laid out so the amount can't collide with a long
// merchant name at phone width.
function Leg({
  label,
  name,
  amount,
  accountName,
  date,
  tone,
}: {
  label: string;
  name: string;
  amount: number;
  accountName: string;
  date: string;
  tone: "out" | "in";
}) {
  return (
    <div className={`rounded-xl p-3 ${tone === "out" ? "bg-red-50" : "bg-emerald-50"}`}>
      <div className={`text-xs font-semibold uppercase tracking-wide ${tone === "out" ? "text-red-900" : "text-emerald-900"}`}>
        {label}
      </div>
      <div className="mt-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{name}</div>
          <div className="truncate text-xs text-slate-600">
            {accountName} · {formatTransactionDate(date)}
          </div>
        </div>
        <div className={`shrink-0 font-bold tabular-nums ${tone === "out" ? "text-red-600" : "text-emerald-600"}`}>
          {tone === "out" ? "-" : "+"}
          {formatCurrency(Math.abs(amount))}
        </div>
      </div>
    </div>
  );
}

export default function Transfers() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("suggested");
  const [suggested, setSuggested] = useState<TransferPair[]>([]);
  const [unmatched, setUnmatched] = useState<{ outgoing: UnmatchedFlow[]; incoming: UnmatchedFlow[] }>({
    outgoing: [],
    incoming: [],
  });
  const [linked, setLinked] = useState<LinkedPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // The outflow the user is matching; the sheet then offers the inflows.
  const [matching, setMatching] = useState<UnmatchedFlow | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [pairs, flows, pairsLinked] = await Promise.all([
        api.detectTransfers(),
        api.getUnmatchedFlows(),
        api.getLinkedPairs(),
      ]);
      setSuggested(pairs);
      setUnmatched(flows);
      setLinked(pairsLinked);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function link(outId: string, inId: string) {
    setBusy(true);
    try {
      await api.linkTransferPair(outId, inId);
      toast.success("Matched — it no longer counts as income or spending");
      setMatching(null);
      await load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function unlink(id: string) {
    setBusy(true);
    try {
      await api.unlinkTransferPair(id);
      toast.success("Unmatched — both sides count again");
      await load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function autoLink() {
    setBusy(true);
    try {
      const { linked: n } = await api.autoLinkTransfers();
      toast.success(n === 0 ? "Nothing confident enough to match automatically" : `Matched ${n} pair${n === 1 ? "" : "s"}`);
      await load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Inflows ranked for the outflow being matched: closest amount first, then
  // closest date. The detector already proposed the exact matches, so what's
  // left here is usually off by a fee or a few days.
  const candidates = useMemo(() => {
    if (!matching) return [];
    return [...unmatched.incoming]
      .filter((i) => i.accountId !== matching.accountId)
      .map((i) => ({
        flow: i,
        amountDiff: Math.abs(Math.abs(i.amountCents) - matching.amountCents),
        dayDiff: Math.abs(new Date(i.date).getTime() - new Date(matching.date).getTime()) / 86_400_000,
      }))
      .sort((a, b) => a.amountDiff - b.amountDiff || a.dayDiff - b.dayDiff);
  }, [matching, unmatched.incoming]);

  if (loading) return <Spinner label="Looking for transfers…" />;

  return (
    <div className="space-y-4">
      <PageHeader title="Transfers" subtitle="Money moving between your own accounts" />

      <details className="rounded-2xl border border-blue-200 bg-blue-50">
        <summary className="flex min-h-[44px] cursor-pointer items-center px-4 text-sm font-medium text-blue-900">
          Why this matters
        </summary>
        <p className="px-4 pb-4 text-sm text-blue-800">
          Moving $500 from checking to savings shows up twice: leaving one account and arriving at the other.
          Unmatched, that counts as $500 of spending and $500 of income, inflating both. Matching the two sides
          marks it as one movement, and it disappears from income, spending and every category breakdown.
        </p>
      </details>

      <Segmented
        options={[
          { value: "suggested", label: `Suggested${suggested.length ? ` (${suggested.length})` : ""}` },
          { value: "manual", label: "Match" },
          { value: "matched", label: `Matched${linked.length ? ` (${linked.length})` : ""}` },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "suggested" && (
        <>
          <Button variant="primary" className="w-full" onClick={autoLink} disabled={busy || suggested.length === 0}>
            Match all high-confidence pairs
          </Button>

          {suggested.length === 0 ? (
            <EmptyState
              icon="⇄"
              title="No suggestions"
              hint="Nothing left that looks like an obvious pair. Use Match to pair anything the detector can't be sure about."
            />
          ) : (
            suggested.map((pair) => (
              <Card key={`${pair.fromTransaction.id}-${pair.toTransaction.id}`}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${confidenceClass(pair.confidence)}`}>
                    {pair.confidence} confidence
                  </span>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => link(pair.fromTransaction.id, pair.toTransaction.id)}
                    disabled={busy}
                  >
                    Match
                  </Button>
                </div>
                <p className="mb-2 text-xs text-slate-500">{pair.reason}</p>
                <div className="space-y-2">
                  <Leg
                    label="Out"
                    tone="out"
                    name={pair.fromTransaction.name}
                    amount={pair.fromTransaction.amountCents}
                    accountName={pair.fromTransaction.accountName}
                    date={String(pair.fromTransaction.date)}
                  />
                  <div className="text-center text-slate-400">↓</div>
                  <Leg
                    label="In"
                    tone="in"
                    name={pair.toTransaction.name}
                    amount={pair.toTransaction.amountCents}
                    accountName={pair.toTransaction.accountName}
                    date={String(pair.toTransaction.date)}
                  />
                </div>
              </Card>
            ))
          )}
        </>
      )}

      {tab === "manual" && (
        <>
          <p className="px-1 text-xs text-slate-500">
            Pick an outgoing transaction, then choose what it arrived as. Use this when the amounts differ — a wire
            fee, say — or the two sides are more than a few days apart, which the detector won't suggest on its own.
          </p>
          {unmatched.outgoing.length === 0 ? (
            <EmptyState icon="✅" title="Nothing unmatched" hint="Every outgoing transaction is either matched or ordinary spending." />
          ) : (
            <Card padded={false}>
              <ul className="divide-y">
                {unmatched.outgoing.map((f) => (
                  <li key={f.id}>
                    <button
                      onClick={() => setMatching(f)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{f.name}</div>
                        <div className="truncate text-xs text-slate-500">
                          {f.accountName} · {formatTransactionDate(f.date)}
                        </div>
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums text-red-600">
                        -{formatCurrency(f.amountCents)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {tab === "matched" && (
        <>
          {linked.length === 0 ? (
            <EmptyState icon="⇄" title="Nothing matched yet" hint="Matched transfers appear here so you can undo one." />
          ) : (
            linked.map((pair, i) => (
              <Card key={pair.outgoing?.id ?? pair.incoming?.id ?? i}>
                {pair.broken && (
                  <p className="mb-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
                    The other side of this is missing. Unmatch it so it counts correctly again.
                  </p>
                )}
                <div className="space-y-2">
                  {pair.outgoing && (
                    <Leg
                      label="Out"
                      tone="out"
                      name={pair.outgoing.name}
                      amount={pair.outgoing.amountCents}
                      accountName={pair.outgoing.accountName}
                      date={pair.outgoing.date}
                    />
                  )}
                  {pair.outgoing && pair.incoming && <div className="text-center text-slate-400">↓</div>}
                  {pair.incoming && (
                    <Leg
                      label="In"
                      tone="in"
                      name={pair.incoming.name}
                      amount={pair.incoming.amountCents}
                      accountName={pair.incoming.accountName}
                      date={pair.incoming.date}
                    />
                  )}
                </div>
                <Button
                  className="mt-3 w-full"
                  disabled={busy}
                  onClick={() => unlink((pair.outgoing ?? pair.incoming)!.id)}
                >
                  Unmatch
                </Button>
              </Card>
            ))
          )}
        </>
      )}

      <Sheet open={!!matching} onClose={() => setMatching(null)} title="What did it arrive as?">
        {matching && (
          <>
            <div className="mb-3 rounded-xl bg-red-50 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-red-900">Matching</div>
              <div className="mt-1 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{matching.name}</div>
                  <div className="truncate text-xs text-slate-600">{matching.accountName}</div>
                </div>
                <span className="shrink-0 font-bold tabular-nums text-red-600">-{formatCurrency(matching.amountCents)}</span>
              </div>
            </div>

            {candidates.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">
                No unmatched incoming transactions on your other accounts.
              </p>
            ) : (
              <ul className="divide-y">
                {candidates.map(({ flow, amountDiff, dayDiff }) => (
                  <li key={flow.id}>
                    <button
                      onClick={() => link(matching.id, flow.id)}
                      disabled={busy}
                      className="flex w-full items-center gap-3 py-3 text-left active:bg-slate-50 disabled:opacity-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{flow.name}</div>
                        <div className="truncate text-xs text-slate-500">
                          {flow.accountName} · {formatTransactionDate(flow.date)}
                        </div>
                        {/* Surfaced rather than hidden: a match that's off by
                            $25 or three weeks may still be right, but the user
                            should be the one deciding that. */}
                        {(amountDiff > 0.01 || dayDiff > 3) && (
                          <div className="mt-0.5 text-xs text-amber-700">
                            {amountDiff > 0.01 && `off by ${formatCurrency(amountDiff)}`}
                            {amountDiff > 0.01 && dayDiff > 3 && " · "}
                            {dayDiff > 3 && `${Math.round(dayDiff)} days apart`}
                          </div>
                        )}
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums text-emerald-600">
                        +{formatCurrency(Math.abs(flow.amountCents))}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Sheet>
    </div>
  );
}
