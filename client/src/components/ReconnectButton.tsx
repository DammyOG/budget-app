import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { api } from "../lib/api";
import {
  PLAID_LINK_MODE_STORAGE_KEY,
  PLAID_LINK_TOKEN_STORAGE_KEY,
  PLAID_RECONNECT_ITEM_ID_STORAGE_KEY,
} from "../lib/plaidOAuth";

// Fixes an expired bank login via Plaid's "update mode" — reuses the existing
// item's access token instead of creating a duplicate connection. Fetched
// lazily on click rather than on mount, since most accounts never need this.
export default function ReconnectButton({
  itemId,
  onReconnected,
}: {
  itemId: string;
  onReconnected: () => void;
}) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const startReconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.createUpdateLinkToken(itemId);
      sessionStorage.setItem(PLAID_LINK_TOKEN_STORAGE_KEY, res.linkToken);
      sessionStorage.setItem(PLAID_LINK_MODE_STORAGE_KEY, "reconnect");
      sessionStorage.setItem(PLAID_RECONNECT_ITEM_ID_STORAGE_KEY, itemId);
      setLinkToken(res.linkToken);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  const onSuccess = useCallback(async () => {
    try {
      // Update mode reuses the existing access token — nothing to exchange,
      // just re-sync now that the login is valid again.
      await api.syncItem(itemId);
      onReconnected();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [itemId, onReconnected]);

  const onExit = useCallback((err: any) => {
    setBusy(false);
    if (err) setError(err.error_message || err.display_message || "Reconnect cancelled");
  }, []);

  const { open, ready } = usePlaidLink({ token: linkToken ?? "", onSuccess, onExit });

  useEffect(() => {
    if (ready && linkToken) open();
  }, [ready, linkToken, open]);

  return (
    <div>
      <button
        onClick={startReconnect}
        disabled={busy}
        className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50"
      >
        {busy ? "Reconnecting…" : "Reconnect"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
