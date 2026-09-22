import { useEffect, useMemo, useState } from "react";
import { api, Account, dollarsToCents, formatCurrency, formatRelativeTime } from "../lib/api";
import PlaidLinkButton from "../components/PlaidLinkButton";
import ReconnectButton from "../components/ReconnectButton";
import ConfirmDialog from "../components/ConfirmDialog";
import { useToast } from "../components/ToastProvider";
import { Button, Card, EmptyState, HeroStat, PageHeader, Sheet, Spinner, Stat, StatGrid } from "../components/ui";

const ACCOUNT_TYPES = [
  { value: "depository", label: "Checking / Savings" },
  { value: "credit", label: "Credit Card" },
  { value: "investment", label: "Investment / IRA" },
  { value: "loan", label: "Loan" },
];

const inputClass = "w-full rounded-xl border border-slate-300 px-3 py-3 text-sm";

function AddManualAccountSheet({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [type, setType] = useState("depository");
  const [subtype, setSubtype] = useState("");
  // Held as the dollars string the user typed; converted on submit.
  const [balanceDollars, setBalanceDollars] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.addManualAccount({
        name,
        institutionName,
        type,
        subtype: subtype || null,
        currentBalanceCents: balanceDollars ? dollarsToCents(Number(balanceDollars)) : null,
      });
      setName("");
      setInstitutionName("");
      setSubtype("");
      setBalanceDollars("");
      onAdded();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Add manual account">
      <form onSubmit={submit} className="space-y-3">
        <input
          required
          placeholder="Account name (e.g. Roth IRA)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
        <input
          required
          placeholder="Institution (e.g. Robinhood)"
          value={institutionName}
          onChange={(e) => setInstitutionName(e.target.value)}
          className={inputClass}
        />
        <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
          {ACCOUNT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          placeholder="Subtype (optional, e.g. roth ira)"
          value={subtype}
          onChange={(e) => setSubtype(e.target.value)}
          className={inputClass}
        />
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          placeholder="Current balance"
          value={balanceDollars}
          onChange={(e) => setBalanceDollars(e.target.value)}
          className={inputClass}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {busy ? "Adding…" : "Add account"}
        </Button>
      </form>
    </Sheet>
  );
}

function ArchivedAccounts({ onRestored }: { onRestored: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [archived, setArchived] = useState<Account[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = () =>
    api.getArchivedAccounts().then((accts) => {
      setArchived(accts);
      setLoaded(true);
    });

  useEffect(() => {
    if (open && !loaded) load();
  }, [open, loaded]);

  const restore = async (a: Account) => {
    try {
      await api.restoreAccount(a.id);
      toast.success(`${a.name} restored`);
      load();
      onRestored();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="min-h-[44px] w-full text-center text-sm text-slate-500 underline"
      >
        View removed accounts
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Removed accounts">
        {archived.length === 0 ? (
          <p className="py-4 text-sm text-slate-500">
            Nothing removed. Deleted accounts show up here, with their transaction history kept, until you restore
            or permanently delete them.
          </p>
        ) : (
          <ul className="divide-y">
            {archived.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-600">{a.name}</div>
                  <div className="truncate text-xs text-slate-400">
                    {a.institutionName} · removed {a.archivedAt ? formatRelativeTime(a.archivedAt) : ""}
                  </div>
                </div>
                <Button size="sm" onClick={() => restore(a)} className="shrink-0">
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </>
  );
}

export default function Accounts() {
  const toast = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Account | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<Account | null>(null);
  const [adding, setAdding] = useState(false);
  const [archivedRefreshKey, setArchivedRefreshKey] = useState(0);

  const load = () => {
    setLoading(true);
    api
      .getAccounts()
      .then(setAccounts)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const grouped = useMemo(() => {
    const groups: Record<string, Account[]> = {};
    for (const a of accounts) {
      groups[a.institutionName] = groups[a.institutionName] || [];
      groups[a.institutionName].push(a);
    }
    return groups;
  }, [accounts]);

  // Credit balances are stored negative, so a plain sum is already net worth.
  const { assets, liabilities } = useMemo(() => {
    let assets = 0;
    let liabilities = 0;
    for (const a of accounts) {
      const b = a.currentBalanceCents ?? 0;
      if (b < 0) liabilities += b;
      else assets += b;
    }
    return { assets, liabilities };
  }, [accounts]);

  const syncAll = async () => {
    setSyncing(true);
    try {
      const { results } = await api.syncAll();
      const failed = results.filter((r: any) => r.error);
      if (failed.length > 0) {
        toast.error(`${failed.length} account${failed.length > 1 ? "s" : ""} failed to sync — see below for details`);
      } else {
        toast.success("All accounts synced");
      }
      load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const confirmRemove = async () => {
    if (!pendingRemoval) return;
    try {
      await api.deleteAccount(pendingRemoval.id);
      toast.success(`${pendingRemoval.name} removed — its history is kept and it can be restored`);
      setPendingRemoval(null);
      setArchivedRefreshKey((k) => k + 1);
      load();
    } catch (err: any) {
      toast.error(err.message);
      setPendingRemoval(null);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Accounts"
        action={
          <Button size="sm" onClick={syncAll} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync all"}
          </Button>
        }
      />

      <PlaidLinkButton onLinked={load} />

      {error && <Card className="border-red-200 bg-red-50 text-sm text-red-700">{error}</Card>}

      {loading ? (
        <Spinner />
      ) : accounts.length === 0 ? (
        <EmptyState
          icon="🏦"
          title="No accounts yet"
          hint="Link a bank above, or add one by hand for anything you track yourself."
        />
      ) : (
        <>
          <HeroStat label="Net worth" value={formatCurrency(assets + liabilities)}>
            <StatGrid>
              <div className="mt-3 border-t pt-3">
                <div className="text-xs text-slate-500">Assets</div>
                <div className="truncate font-semibold tabular-nums text-emerald-600">{formatCurrency(assets)}</div>
              </div>
              <div className="mt-3 border-t pt-3">
                <div className="text-xs text-slate-500">Liabilities</div>
                <div className="truncate font-semibold tabular-nums text-red-600">{formatCurrency(liabilities)}</div>
              </div>
            </StatGrid>
          </HeroStat>

          {Object.entries(grouped).map(([institution, accts]) => {
            const plaidItem = accts.find((a) => a.plaidItem)?.plaidItem;
            return (
              <Card key={institution} padded={false} className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-slate-50 px-4 py-2.5">
                  <span className="text-sm font-semibold">{institution}</span>
                  {plaidItem &&
                    (plaidItem.needsReauth ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-amber-700">Login expired</span>
                        <ReconnectButton
                          itemId={accts.find((a) => a.plaidItemId)!.plaidItemId!}
                          onReconnected={() => {
                            toast.success(`${institution} reconnected`);
                            load();
                          }}
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">Synced {formatRelativeTime(plaidItem.lastSyncedAt)}</span>
                    ))}
                </div>
                <ul className="divide-y">
                  {accts.map((a) => (
                    <li key={a.id}>
                      {/* Name and balance were colliding with no gap ("Advantage
                          Checking$4,820.11") because both sat in an auto-width
                          flex row. The name now truncates and the balance is
                          shrink-0, so they can never overlap. */}
                      <button
                        onClick={() => setSelected(a)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">
                            {a.name} {a.mask && <span className="text-slate-400">••{a.mask}</span>}
                          </div>
                          <div className="truncate text-xs capitalize text-slate-500">
                            {a.subtype || a.type}
                            {a.isManual && " · manual"}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 font-semibold tabular-nums ${
                            (a.currentBalanceCents ?? 0) < 0 ? "text-red-600" : "text-slate-900"
                          }`}
                        >
                          {formatCurrency(a.currentBalanceCents)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}

          <StatGrid>
            <Stat label="Accounts" value={String(accounts.length)} />
            <Stat label="Institutions" value={String(Object.keys(grouped).length)} />
          </StatGrid>
        </>
      )}

      <Button className="w-full" onClick={() => setAdding(true)}>
        + Add manual account
      </Button>

      <ArchivedAccounts key={archivedRefreshKey} onRestored={load} />

      <AddManualAccountSheet open={adding} onClose={() => setAdding(false)} onAdded={load} />

      {/* "Remove" used to be an 11px text link wedged next to the balance.
          It lives here now, where it has room and can't be hit by accident. */}
      <Sheet open={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? ""}>
        {selected && (
          <div className="space-y-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-slate-500">Balance</span>
              <span className="text-lg font-semibold tabular-nums">{formatCurrency(selected.currentBalanceCents)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-slate-500">Type</span>
              <span className="text-sm capitalize">{selected.subtype || selected.type}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-slate-500">Source</span>
              <span className="text-sm">{selected.isManual ? "Manual" : "Linked via Plaid"}</span>
            </div>
            <Button
              variant="danger"
              className="w-full"
              onClick={() => {
                setPendingRemoval(selected);
                setSelected(null);
              }}
            >
              Remove account
            </Button>
          </div>
        )}
      </Sheet>

      {pendingRemoval && (
        <ConfirmDialog
          title={`Remove ${pendingRemoval.name}?`}
          message={
            pendingRemoval.isManual
              ? 'This hides the account. Its transaction history is kept and you can restore it later from "View removed accounts."'
              : 'This disconnects the bank login and hides the account. Its transaction history is kept and you can restore it later from "View removed accounts."'
          }
          confirmLabel="Remove"
          danger
          onConfirm={confirmRemove}
          onCancel={() => setPendingRemoval(null)}
        />
      )}
    </div>
  );
}
