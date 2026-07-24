import { useEffect, useState } from "react";
import { api, formatCurrency, type TransferPair } from "../lib/api";

export default function Transfers() {
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
      alert(`Failed to link transfer: ${err.message}`);
    } finally {
      setLinking(false);
    }
  }

  async function autoLink() {
    setLinking(true);
    try {
      const result = await api.autoLinkTransfers();
      alert(`Auto-linked ${result.linked} high-confidence transfers out of ${result.total} detected.`);
      loadPotentialTransfers();
    } catch (err: any) {
      alert(`Failed to auto-link: ${err.message}`);
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
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Transfer Detection</h1>
        <button
          onClick={autoLink}
          disabled={linking || potentialTransfers.length === 0}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          Auto-Link High Confidence
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h2 className="font-semibold text-blue-900 mb-2">What are transfer pairs?</h2>
        <p className="text-sm text-blue-800">
          Transfer pairs are transactions that represent the same money movement between your accounts (like moving
          $1,499 from Bank of America to Ally). Linking them prevents these from being counted as both income and
          expense, giving you accurate spending totals.
        </p>
      </div>

      {loading && <p>Loading potential transfers...</p>}

      {error && <p className="text-red-600">Error: {error}</p>}

      {!loading && !error && potentialTransfers.length === 0 && (
        <div className="bg-white p-8 rounded-lg shadow text-center">
          <p className="text-gray-500">No potential transfer pairs detected. All your transfers may already be linked!</p>
        </div>
      )}

      {!loading && !error && potentialTransfers.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Found {potentialTransfers.length} potential transfer pair{potentialTransfers.length !== 1 ? "s" : ""}. Review
            and link them to exclude from income/spending calculations.
          </p>

          {potentialTransfers.map((pair, index) => (
            <div key={`${pair.fromTransaction.id}-${pair.toTransaction.id}`} className="bg-white p-4 md:p-6 rounded-lg shadow">
              <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-start gap-3 mb-4">
                <div>
                  <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getConfidenceBadgeColor(pair.confidence)}`}>
                    {pair.confidence} confidence
                  </span>
                </div>
                <button
                  onClick={() => linkPair(pair)}
                  disabled={linking}
                  className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  Link as Transfer
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* From Transaction */}
                <div className="border rounded-lg p-4 bg-red-50">
                  <h3 className="text-sm font-semibold text-red-900 mb-2">From (Debit)</h3>
                  <div className="space-y-2">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{pair.fromTransaction.name}</div>
                      <div className="text-xs text-gray-600">{pair.fromTransaction.accountName}</div>
                    </div>
                    <div className="text-xs text-gray-600">
                      {new Date(pair.fromTransaction.date).toLocaleDateString()}
                    </div>
                    <div className="text-lg font-bold text-red-600">
                      -{formatCurrency(pair.fromTransaction.amount)}
                    </div>
                  </div>
                </div>

                {/* To Transaction */}
                <div className="border rounded-lg p-4 bg-green-50">
                  <h3 className="text-sm font-semibold text-green-900 mb-2">To (Credit)</h3>
                  <div className="space-y-2">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{pair.toTransaction.name}</div>
                      <div className="text-xs text-gray-600">{pair.toTransaction.accountName}</div>
                    </div>
                    <div className="text-xs text-gray-600">
                      {new Date(pair.toTransaction.date).toLocaleDateString()}
                    </div>
                    <div className="text-lg font-bold text-green-600">
                      +{formatCurrency(pair.toTransaction.amount)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
