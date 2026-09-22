import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Account,
  api,
  AttentionCounts,
  Category,
  formatSignedAmount,
  formatTransactionDate,
  SortDirection,
  Transaction,
  TransactionKind,
  TransactionSort,
} from "../lib/api";
import TransactionDetailModal from "../components/TransactionDetailModal";
import { useToast } from "../components/ToastProvider";
import { Button, PageHeader } from "../components/ui";

const PAGE_SIZE = 100;

interface Filters {
  accountId: string;
  categoryId: string;
  kind: TransactionKind | "";
  startDate: string;
  endDate: string;
  minAmount: string;
  maxAmount: string;
  pendingOnly: boolean;
  duplicatesOnly: boolean;
  // Off by default: a matched transfer is one movement shown once. Turning
  // this on shows both legs, which is what you want when reconciling against
  // a single account's statement.
  showBothTransferLegs: boolean;
}

const EMPTY_FILTERS: Filters = {
  accountId: "",
  categoryId: "",
  kind: "",
  startDate: "",
  endDate: "",
  minAmount: "",
  maxAmount: "",
  pendingOnly: false,
  duplicatesOnly: false,
  showBothTransferLegs: false,
};

const KIND_LABELS: Record<TransactionKind, string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
};

function countActive(f: Filters): number {
  return Object.entries(f).filter(([, v]) => v !== "" && v !== false).length;
}

// "Today" / "Yesterday" / a full date — makes a long, Plaid-synced list
// scannable instead of just a wall of rows.
function dateGroupLabel(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00Z");
  const today = new Date();
  const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const diffDays = Math.round((todayUTC - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

function TransactionRow({ tx, onOpen }: { tx: Transaction; onOpen: () => void }) {
  const isTransfer = tx.kind === "transfer";
  return (
    <button
      onClick={onOpen}
      className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 active:bg-slate-100"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-slate-900 truncate">{tx.name}</span>
          {isTransfer && (
            <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
              ⇄
            </span>
          )}
          {tx.isDuplicate && (
            <span
              className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800"
              title="Same merchant, amount, and day as another charge on this account — possible double charge"
            >
              possible duplicate
            </span>
          )}
          {tx.pending && <span className="shrink-0 text-xs text-amber-600">pending</span>}
        </div>
        <div className="text-sm text-slate-500 truncate">
          {/* A collapsed transfer shows the route the money took rather than
              just the account the row happens to live on. */}
          {isTransfer && tx.transferCounterpartAccount
            ? `${tx.account?.name} → ${tx.transferCounterpartAccount}`
            : tx.account?.name}
          {!isTransfer && ` · ${tx.category?.name || "Uncategorized"}`}
        </div>
      </div>
      <div
        className={`shrink-0 font-semibold ${
          isTransfer ? "text-slate-400" : tx.amount > 0 ? "text-slate-900" : "text-emerald-600"
        }`}
      >
        {formatSignedAmount(tx.amount)}
      </div>
    </button>
  );
}

// Why the list is empty depends on what you actually have. Telling someone
// with three linked banks to "link an account" sends them somewhere that
// can't help; the real answer is usually that nothing has been synced, or
// that their accounts are manual and never will sync.
function EmptyTransactions({ accounts, onSynced }: { accounts: Account[]; onSynced: () => void }) {
  const toast = useToast();
  const [syncing, setSyncing] = useState(false);

  if (accounts.length === 0) {
    return (
      <div>
        <p className="font-medium text-slate-700">No accounts yet</p>
        <p className="mx-auto mt-1 max-w-xs">
          Link a bank on the{" "}
          <Link to="/accounts" className="inline-flex min-h-[40px] items-center font-medium text-indigo-600">
            Accounts
          </Link>{" "}
          page, or add one by hand.
        </p>
      </div>
    );
  }

  const linked = accounts.filter((a) => !a.isManual);
  const needsReauth = linked.filter((a) => a.plaidItem?.needsReauth);

  const sync = async () => {
    setSyncing(true);
    try {
      const { results } = await api.syncAll();
      const failed = results.filter((r: any) => r.error);
      if (failed.length) toast.error(`${failed.length} account${failed.length > 1 ? "s" : ""} failed to sync`);
      else toast.success("Synced");
      onSynced();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <p className="font-medium text-slate-700">No transactions yet</p>
      {linked.length === 0 ? (
        <p className="mx-auto mt-1 max-w-xs">
          All {accounts.length} of your accounts are manual, so they only carry a balance — that's why a net worth
          shows but there's no history here. Link a bank to pull transactions in.
        </p>
      ) : needsReauth.length > 0 ? (
        <p className="mx-auto mt-1 max-w-xs">
          {needsReauth.length} account{needsReauth.length > 1 ? "s need" : " needs"} to be reconnected before
          transactions can come through.
        </p>
      ) : (
        <p className="mx-auto mt-1 max-w-xs">
          Your accounts are linked but nothing has come through yet. A first sync can take a few minutes.
        </p>
      )}
      <div className="mt-4 flex justify-center gap-2">
        {linked.length > 0 && (
          <Button variant="primary" size="sm" onClick={sync} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        )}
        <Link
          to="/accounts"
          className="inline-flex min-h-[40px] items-center rounded-xl border border-slate-300 px-3 text-xs font-medium text-slate-700"
        >
          Manage accounts
        </Link>
      </div>
    </div>
  );
}

function FilterSheet({
  filters,
  onChange,
  onClose,
  accounts,
  categories,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  onClose: () => void;
  accounts: Account[];
  categories: Category[];
}) {
  const [draft, setDraft] = useState(filters);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-md sm:rounded-lg rounded-t-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white">
          <h2 className="font-semibold text-lg">Filters</h2>
          <button onClick={onClose} className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-xl leading-none text-slate-400 active:bg-slate-100">
            ×
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Account</label>
            <select
              value={draft.accountId}
              onChange={(e) => setDraft({ ...draft, accountId: e.target.value })}
              className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
            >
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.institutionName} · {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
            <select
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value as TransactionKind | "" })}
              className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
            >
              <option value="">All types</option>
              {(Object.keys(KIND_LABELS) as TransactionKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
            <select
              value={draft.categoryId}
              onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
              className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
            >
              <option value="">All categories</option>
              <option value="uncategorized">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Date range</label>
            <div className="flex gap-2 items-center">
              <input
                type="date"
                value={draft.startDate}
                onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-2 text-sm"
              />
              <span className="text-slate-400 text-sm">to</span>
              <input
                type="date"
                value={draft.endDate}
                onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Amount range</label>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                placeholder="Min"
                value={draft.minAmount}
                onChange={(e) => setDraft({ ...draft, minAmount: e.target.value })}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-2 text-sm"
              />
              <span className="text-slate-400 text-sm">to</span>
              <input
                type="number"
                placeholder="Max"
                value={draft.maxAmount}
                onChange={(e) => setDraft({ ...draft, maxAmount: e.target.value })}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-2 text-sm"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={draft.pendingOnly}
              onChange={(e) => setDraft({ ...draft, pendingOnly: e.target.checked })}
            />
            Pending only
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={draft.duplicatesOnly}
              onChange={(e) => setDraft({ ...draft, duplicatesOnly: e.target.checked })}
            />
            Possible duplicates only
          </label>

          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-1"
              checked={draft.showBothTransferLegs}
              onChange={(e) => setDraft({ ...draft, showBothTransferLegs: e.target.checked })}
            />
            <span>
              Show both sides of transfers
              <span className="block text-xs text-slate-500">
                Off by default — a transfer is one movement of money, shown once. Turn on to reconcile against a
                statement.
              </span>
            </span>
          </label>
        </div>

        <div className="p-4 border-t flex gap-2 sticky bottom-0 bg-white">
          <button
            onClick={() => {
              setDraft(EMPTY_FILTERS);
              onChange(EMPTY_FILTERS);
            }}
            className="min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-700 active:bg-slate-50"
          >
            Clear all
          </button>
          <button
            onClick={() => {
              onChange(draft);
              onClose();
            }}
            className="flex-1 px-4 py-2 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-500"
          >
            Apply filters
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Transactions() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>({
    ...EMPTY_FILTERS,
    // The Dashboard's budget-vs-actual and category tiles link here with a
    // pre-set category, so a direct link lands already filtered.
    categoryId: searchParams.get("categoryId") || "",
  });
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [sort, setSort] = useState<TransactionSort>("date");
  const [dir, setDir] = useState<SortDirection>("desc");
  const [attention, setAttention] = useState<AttentionCounts | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [lastCategorized, setLastCategorized] = useState<{
    name: string;
    categoryId: string;
    categoryName: string;
  } | null>(null);

  // Typing shouldn't fire a request per keystroke; wait for a pause.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const buildParams = (offset: number) => {
    const params: Record<string, string> = {
      limit: String(PAGE_SIZE),
      offset: String(offset),
      sort,
      dir,
    };
    if (filters.accountId) params.accountId = filters.accountId;
    if (filters.categoryId) params.categoryId = filters.categoryId;
    if (filters.kind) params.kind = filters.kind;
    if (filters.startDate) params.startDate = filters.startDate;
    if (filters.endDate) params.endDate = filters.endDate;
    if (filters.minAmount) params.minAmount = filters.minAmount;
    if (filters.maxAmount) params.maxAmount = filters.maxAmount;
    if (filters.pendingOnly) params.pendingOnly = "true";
    if (filters.duplicatesOnly) params.duplicatesOnly = "true";
    if (!filters.showBothTransferLegs) params.collapseTransfers = "true";
    else params.collapseTransfers = "false";
    if (search) params.search = search;
    return params;
  };

  // Any filter (or a new search term) starts over from the first page —
  // otherwise "Load more" would keep appending results from the old filter.
  const load = () => {
    api
      .getTransactions(buildParams(0))
      .then((res) => {
        setTransactions(res.transactions);
        setTotal(res.total);
        setHasMore(res.hasMore);
        setCollapsed(res.collapsed);
      })
      .catch((err) => setError(err.message));
    api.getAttentionCounts().then(setAttention).catch(() => undefined);
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await api.getTransactions(buildParams(transactions.length));
      setTransactions((prev) => [...prev, ...res.transactions]);
      setTotal(res.total);
      setHasMore(res.hasMore);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    api.getAccounts().then(setAccounts).catch((err) => setError(err.message));
    api.getCategories().then(setCategories).catch((err) => setError(err.message));
  }, []);

  useEffect(load, [filters, search, sort, dir]);

  // Date headers only make sense while the list is in date order. Grouping a
  // list sorted by amount or name would silently re-sort it back into date
  // order and throw away the sort the user just picked.
  const groups = useMemo(() => {
    if (sort !== "date") return null;
    const byDate: Record<string, Transaction[]> = {};
    for (const tx of transactions) {
      const key = tx.date.slice(0, 10);
      (byDate[key] ||= []).push(tx);
    }
    // Server already ordered the rows; preserve that order for the headers
    // rather than re-deriving it, so ascending date sort isn't flipped back.
    const seen: string[] = [];
    for (const tx of transactions) {
      const key = tx.date.slice(0, 10);
      if (!seen.includes(key)) seen.push(key);
    }
    return seen.map((key) => [key, byDate[key]] as [string, Transaction[]]);
  }, [transactions, sort]);

  const activeFilterCount = countActive(filters);

  const handleUpdate = () => {
    setSelectedTransaction(null);
    load();
  };

  // Offers to apply a freshly-picked category to every transaction sharing
  // that name — Plaid's sync tends to reuse the exact same merchant string,
  // so this clears out a batch in one click.
  const handleCategorized = (categoryId: string) => {
    if (!selectedTransaction) return;
    const category = categories.find((c) => c.id === categoryId);
    setLastCategorized({
      name: selectedTransaction.name,
      categoryId,
      categoryName: category?.name || "Unknown",
    });
  };

  const categorizeAllSimilar = async () => {
    if (!lastCategorized) return;
    setProcessing(true);
    try {
      const result = await api.categorizeAllSimilar(lastCategorized.name, lastCategorized.categoryId);
      setLastCategorized(null);
      load();
      toast.success(`Categorized ${result.count} similar transaction${result.count !== 1 ? "s" : ""}.`);
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const autoCategorize = async () => {
    setProcessing(true);
    try {
      const result = await api.autoCategorizeAll();
      toast.success(
        `Auto-categorization complete. Newly categorized: ${result.categorized}, re-categorized: ${result.recategorized}.`
      );
      load();
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setProcessing(false);
      setShowMaintenance(false);
    }
  };

  return (
    <div className="space-y-3">
      <PageHeader
        title="Transactions"
        action={
          <div className="relative">
            <button
              onClick={() => setShowMaintenance(!showMaintenance)}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-300 text-slate-500 active:bg-slate-100"
              aria-label="More actions"
            >
              ⋯
            </button>
            {showMaintenance && (
              <div className="absolute right-0 z-10 mt-1 w-56 rounded-xl border bg-white text-sm shadow-lg">
                <button
                  onClick={autoCategorize}
                  disabled={processing}
                  className="min-h-[48px] w-full px-4 text-left active:bg-slate-50 disabled:opacity-50"
                >
                  {processing ? "Processing…" : "Re-run auto-categorization"}
                </button>
              </div>
            )}
          </div>
        }
      />

      <div className="flex gap-2">
        <input
          placeholder="Search transactions…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="min-h-[44px] flex-1 rounded-xl border border-slate-300 px-3 text-sm"
        />
        <button
          onClick={() => setShowFilterSheet(true)}
          className={`min-h-[44px] whitespace-nowrap rounded-xl border px-4 text-sm font-medium ${
            activeFilterCount > 0
              ? "border-indigo-300 bg-indigo-50 text-indigo-700"
              : "border-slate-300 bg-white text-slate-700 active:bg-slate-50"
          }`}
        >
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </button>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="shrink-0 text-slate-500">Sort</span>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as TransactionSort)}
          aria-label="Sort by"
          className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-2 text-sm"
        >
          <option value="date">Date</option>
          <option value="amount">Amount</option>
          <option value="name">Name</option>
        </select>
        <button
          onClick={() => setDir(dir === "asc" ? "desc" : "asc")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-300 active:bg-slate-100"
          title={
            dir === "desc"
              ? sort === "date"
                ? "Newest first"
                : "Largest first"
              : sort === "date"
              ? "Oldest first"
              : "Smallest first"
          }
        >
          {dir === "desc" ? "↓" : "↑"}
        </button>
        {!collapsed && filters.accountId && (
          <span className="text-xs text-slate-400">Showing both sides of transfers</span>
        )}
      </div>

      {/* Counts rather than reordering the list: sorting "what needs
          attention" into the ledger would make it reshuffle under you as you
          categorize things. */}
      {attention && attention.total > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="font-medium text-amber-900">Needs attention</span>
            <div className="flex gap-2 flex-wrap">
              {attention.uncategorized > 0 && (
                <button
                  onClick={() => setFilters({ ...EMPTY_FILTERS, categoryId: "uncategorized" })}
                  className="min-h-[40px] rounded-full border border-amber-300 bg-white px-3 text-xs font-medium text-amber-900 active:bg-amber-100"
                >
                  {attention.uncategorized} uncategorized
                </button>
              )}
              {attention.duplicateGroups > 0 && (
                <button
                  onClick={() => setFilters({ ...EMPTY_FILTERS, duplicatesOnly: true })}
                  className="min-h-[40px] rounded-full border border-amber-300 bg-white px-3 text-xs font-medium text-amber-900 active:bg-amber-100"
                >
                  {attention.duplicateGroups} possible duplicate
                  {attention.duplicateGroups === 1 ? "" : "s"}
                </button>
              )}
              {attention.pending > 0 && (
                <button
                  onClick={() => setFilters({ ...EMPTY_FILTERS, pendingOnly: true })}
                  className="min-h-[40px] rounded-full border border-amber-300 bg-white px-3 text-xs font-medium text-amber-900 active:bg-amber-100"
                >
                  {attention.pending} pending
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {lastCategorized && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 flex items-center justify-between gap-3 text-sm">
          <p className="text-indigo-900">
            Categorize every other "{lastCategorized.name}" as {lastCategorized.categoryName}?
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={categorizeAllSimilar}
              disabled={processing}
              className="px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              Yes
            </button>
            <button onClick={() => setLastCategorized(null)} className="px-3 py-1 rounded text-indigo-700 hover:bg-indigo-100">
              No
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-lg border bg-white overflow-hidden">
        {transactions.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500">
            {total > 0 || search || activeFilterCount > 0 ? (
              "Nothing matches your search or filters."
            ) : (
              // "Link an account" was shown whenever the list was empty, even
              // to someone who already had accounts — which is confusing when
              // the dashboard is showing a net worth from those same accounts.
              // Balances and transactions come from different places: an
              // account can have a balance and no history at all.
              <EmptyTransactions accounts={accounts} onSynced={load} />
            )}
          </div>
        ) : groups ? (
          groups.map(([date, rows]) => (
            <div key={date}>
              <div className="sticky top-0 bg-slate-50 px-4 py-1.5 text-xs font-medium text-slate-500 border-b">
                {dateGroupLabel(date)}
              </div>
              <div className="divide-y">
                {rows.map((tx) => (
                  <TransactionRow key={tx.id} tx={tx} onOpen={() => setSelectedTransaction(tx)} />
                ))}
              </div>
            </div>
          ))
        ) : (
          // Sorted by amount or name: a flat list, since date headers would
          // imply an ordering the list no longer has.
          <div className="divide-y">
            {transactions.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} onOpen={() => setSelectedTransaction(tx)} />
            ))}
          </div>
        )}
        {transactions.length > 0 && (
          <div className="px-4 py-3 border-t text-center">
            {hasMore ? (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="text-sm text-indigo-600 hover:text-indigo-500 disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : `Load more (${transactions.length} of ${total})`}
              </button>
            ) : (
              <span className="text-xs text-slate-400">
                {total} transaction{total !== 1 ? "s" : ""} — that's all of them
              </span>
            )}
          </div>
        )}
      </div>

      {showFilterSheet && (
        <FilterSheet
          filters={filters}
          onChange={setFilters}
          onClose={() => setShowFilterSheet(false)}
          accounts={accounts}
          categories={categories}
        />
      )}

      {selectedTransaction && (
        <TransactionDetailModal
          transaction={selectedTransaction}
          categories={categories}
          onClose={() => setSelectedTransaction(null)}
          onUpdate={handleUpdate}
          onCategorized={handleCategorized}
        />
      )}
    </div>
  );
}
