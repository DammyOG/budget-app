import { useEffect, useMemo, useState } from "react";
import { api, Account, formatCurrency } from "../lib/api";
import PlaidLinkButton from "../components/PlaidLinkButton";

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

export default function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      await api.syncAll();
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this account? Its transactions will be deleted too.")) return;
    await api.deleteAccount(id);
    load();
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

      {Object.entries(grouped).map(([institution, accts]) => (
        <div key={institution} className="rounded-lg border bg-white overflow-hidden">
          <div className="bg-slate-100 px-4 py-2 font-medium text-sm">{institution}</div>
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
                  <button onClick={() => remove(a.id)} className="text-xs text-slate-400 hover:text-red-600">
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <AddManualAccountForm onAdded={load} />
    </div>
  );
}
