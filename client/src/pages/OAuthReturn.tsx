import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePlaidLink } from "react-plaid-link";
import { api } from "../lib/api";
import {
  PLAID_LINK_MODE_STORAGE_KEY,
  PLAID_LINK_TOKEN_STORAGE_KEY,
  PLAID_RECONNECT_ITEM_ID_STORAGE_KEY,
  PlaidLinkMode,
} from "../lib/plaidOAuth";

// Landing point for Plaid's OAuth redirect: banks that use OAuth (Bank of
// America, Capital One, etc.) send the whole browser here after the user
// logs in at the bank, instead of resolving inside the original popup.
// Link has to be re-initialized with the *same* link token used before the
// redirect, plus the URL it just landed on, to pick the flow back up. This
// also covers reconnecting an expired login (update mode), which completes
// differently — a re-sync instead of a public token exchange.
export default function OAuthReturn() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [linkToken] = useState<string | null>(() => sessionStorage.getItem(PLAID_LINK_TOKEN_STORAGE_KEY));
  const [mode] = useState<PlaidLinkMode>(
    () => (sessionStorage.getItem(PLAID_LINK_MODE_STORAGE_KEY) as PlaidLinkMode) || "link"
  );
  const [reconnectItemId] = useState<string | null>(() =>
    sessionStorage.getItem(PLAID_RECONNECT_ITEM_ID_STORAGE_KEY)
  );

  const cleanup = () => {
    sessionStorage.removeItem(PLAID_LINK_TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(PLAID_LINK_MODE_STORAGE_KEY);
    sessionStorage.removeItem(PLAID_RECONNECT_ITEM_ID_STORAGE_KEY);
  };

  const onSuccess = useCallback(
    async (publicToken: string) => {
      try {
        if (mode === "reconnect" && reconnectItemId) {
          await api.syncItem(reconnectItemId);
        } else {
          await api.exchangePublicToken(publicToken);
        }
      } catch (err: any) {
        setError(err.message);
        return;
      } finally {
        cleanup();
      }
      navigate("/accounts");
    },
    [navigate, mode, reconnectItemId]
  );

  const onExit = useCallback(() => {
    cleanup();
    navigate("/accounts");
  }, [navigate]);

  const { open, ready } = usePlaidLink({
    token: linkToken ?? "",
    receivedRedirectUri: window.location.href,
    onSuccess,
    onExit,
  });

  useEffect(() => {
    if (ready) open();
  }, [ready, open]);

  if (!linkToken) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center space-y-3">
        <h1 className="text-lg font-semibold">Link session expired</h1>
        <p className="text-sm text-slate-500">
          This page only works right after starting a bank login from the Accounts page. Go back and try again.
        </p>
        <button
          onClick={() => navigate("/accounts")}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Back to Accounts
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-16 text-center space-y-3">
      <h1 className="text-lg font-semibold">Finishing up…</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
