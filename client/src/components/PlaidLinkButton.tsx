import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { api } from "../lib/api";

export default function PlaidLinkButton({ onLinked }: { onLinked: () => void }) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .createLinkToken()
      .then((res) => setLinkToken(res.linkToken))
      .catch((err) => setError(err.message));
  }, []);

  const onSuccess = useCallback(
    async (publicToken: string) => {
      setBusy(true);
      setError(null);
      try {
        await api.exchangePublicToken(publicToken);
        onLinked();
      } catch (err: any) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
    },
    [onLinked]
  );

  const { open, ready } = usePlaidLink({
    token: linkToken ?? "",
    onSuccess,
  });

  return (
    <div>
      <button
        onClick={() => open()}
        disabled={!ready || !linkToken || busy}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {busy ? "Linking…" : "+ Link an account"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
