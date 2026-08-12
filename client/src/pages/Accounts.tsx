import { useEffect, useMemo, useState } from "react";
import { api, Account, formatCurrency, formatRelativeTime } from "../lib/api";
import PlaidLinkButton from "../components/PlaidLinkButton";
import ReconnectButton from "../components/ReconnectButton";
import ConfirmDialog from "../components/ConfirmDialog";
import { useToast } from "../components/ToastProvider";

const ACCOUNT_TYPES = [
  { value: "depository", label: "Checking / Savings" },
  { value: "credit", label: "Credit Card" },
  { value: "investment", label: "Investment / IRA" },
  { value: "loan", label: "Loan" },
];

function AddManualAccountForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [type, setType] = useState("depository");
  const [subtype, setSubtype] = useState("");
  const [currentBalance, setCurrentBalance] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
      >
        + Add manual account
      </button>
    );
  }

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
        currentBalance: currentBalance ? Number(currentBalance) : null,
      });
      setOpen(false);
      setName("");
      setInstitutionName("");
      setCurrentBalance("");
      onAdded();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-md border bg-white p-4 space-y-3 max-w-md">
      <h3 className="font-medium">Add manual account</h3>
      <input
        required
        placeholder="Account name (e.g. Roth IRA)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded border px-3 py-2 text-sm"
      />
      <input
        required
        placeholder="Institution (e.g. Robinhood)"
        value={institutionName}
        onChange={(e) => setInstitutionName(e.target.value)}
        className="w-full rounded border px-3 py-2 text-sm"
      />
      <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded border px-3 py-2 text-sm">
        {ACCOUNT_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <input
        placeholder="Subtype (e.g. roth ira)"
        value={subtype}
        onChange={(e) => setSubtype(e.target.value)}
        className="w-full rounded border px-3 py-2 text-sm"
      />
      <input
        type="number"
        step="0.01"
        placeholder="Current balance"
        value={currentBalance}
        onChange={(e) => setCurrentBalance(e.target.value)}
        className="w-full rounded border px-3 py-2 text-sm"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add account"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-slate-600">
          Cancel
        </button>
      </div>
    </form>
  );
}

function ArchivedAccounts({ onRestored }: { onRestored: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [archived, setArchived] = useState<Account[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = () => api.getArchivedAccounts().then((accts) => { setArchived(accts); setLoaded(true); });

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

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm text-slate-500 hover:text-slate-700 underline">
        View removed accounts
      </button>
    );
  }

  return (
    <div className="rounded-lg border bg-white overflow-hidden">
      <div className="bg-slate-100 px-4 py-2 font-medium text-sm flex items-center justify-between">
        Removed accounts
        <button onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:text-slate-700">
          Hide
        </button>
      </div>
      {archived.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500">Nothing removed. Deleted accounts show up here, with their transaction history kept, until you restore or permanently delete them.</p>
      ) : (
        <ul className="divide-y">
          {archived.map((a) => (
            <li key={a.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="font-medium text-slate-500">{a.name}</div>
                <div className="text-xs text-slate-400">
                  {a.institutionName} · removed {a.archivedAt ? formatRelativeTime(a.archivedAt) : ""}
                </div>
              </div>
              <button
                onClick={() => restore(a)}
                className="text-xs rounded border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Accounts() {
  const toast = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<Account | null>(null);
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
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">Accounts</h1>
        <div className="flex gap-2">
          <button
            onClick={syncAll}
            disabled={syncing}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Sync all"}
          </button>
          <PlaidLinkButton onLinked={load} />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      {!loading && accounts.length === 0 && (
        <p className="text-sm text-slate-500">
          No accounts yet. Link a bank via Plaid, or add one manually below (e.g. for accounts you track by hand).
        </p>
      )}

      {Object.entries(grouped).map(([institution, accts]) => {
        const plaidItem = accts.find((a) => a.plaidItem)?.plaidItem;
        return (
          <div key={institution} className="rounded-lg border bg-white overflow-hidden">
            <div className="bg-slate-100 px-4 py-2 flex items-center justify-between gap-3 flex-wrap">
              <span className="font-medium text-sm">{institution}</span>
              {plaidItem && (
                <div className="flex items-center gap-2">
                  {plaidItem.needsReauth ? (
                    <>
                      <span className="text-xs text-amber-700">Login expired — data may be out of date</span>
                      <ReconnectButton
                        itemId={accts.find((a) => a.plaidItemId)!.plaidItemId!}
                        onReconnected={() => {
                          toast.success(`${institution} reconnected`);
                          load();
                        }}
                      />
                    </>
                  ) : (
                    <span className="text-xs text-slate-500">
                      Synced {formatRelativeTime(plaidItem.lastSyncedAt)}
                    </span>
                  )}
                </div>
              )}
            </div>
            <ul className="divide-y">
              {accts.map((a) => (
                <li key={a.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="font-medium">
                      {a.name} {a.mask && <span className="text-slate-400">••{a.mask}</span>}
                    </div>
                    <div className="text-xs text-slate-500 capitalize">
                      {a.subtype || a.type} {a.isManual && "· manual"}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`font-semibold ${a.type === "credit" ? "text-red-600" : "text-slate-900"}`}>
                      {formatCurrency(a.currentBalance)}
                    </span>
                    <button
                      onClick={() => setPendingRemoval(a)}
                      className="text-xs text-slate-400 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      <AddManualAccountForm onAdded={load} />

      <ArchivedAccounts key={archivedRefreshKey} onRestored={load} />

      {pendingRemoval && (
        <ConfirmDialog
          title={`Remove ${pendingRemoval.name}?`}
          message={
            pendingRemoval.isManual
              ? "This hides the account. Its transaction history is kept and you can restore it later from \"View removed accounts.\""
              : "This disconnects the bank login and hides the account. Its transaction history is kept and you can restore it later from \"View removed accounts.\""
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
