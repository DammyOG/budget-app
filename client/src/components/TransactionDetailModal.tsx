import { useState } from "react";
import { api, formatSignedAmount, Transaction, Category, TransactionKind } from "../lib/api";
import { useToast } from "./ToastProvider";

const KIND_LABELS: Record<TransactionKind, string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
};

interface Props {
  transaction: Transaction;
  categories: Category[];
  onClose: () => void;
  onUpdate: () => void;
  // Fired only when the category actually changed, separately from onUpdate,
  // so the caller can offer "apply to every transaction with this name"
  // without having to diff the transaction itself.
  onCategorized?: (categoryId: string) => void;
}

export default function TransactionDetailModal({
  transaction,
  categories,
  onClose,
  onUpdate,
  onCategorized,
}: Props) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [categoryId, setCategoryId] = useState(transaction.categoryId || "");
  const [kind, setKind] = useState<TransactionKind>(transaction.kind);
  const [notes, setNotes] = useState(transaction.notes || "");
  const [saving, setSaving] = useState(false);

  const saveChanges = async () => {
    setSaving(true);
    try {
      await api.updateTransaction(transaction.id, {
        categoryId: categoryId || null,
        // Sending kind only when it actually changed avoids re-locking it
        // (and, for a paired transfer, breaking the pair) on every save when
        // the user only meant to edit notes.
        kind: kind !== transaction.kind ? kind : undefined,
        notes: notes || null,
      });
      if (categoryId && categoryId !== transaction.categoryId) onCategorized?.(categoryId);
      onUpdate();
      setEditing(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="border-b p-6 flex items-start justify-between">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">{transaction.name}</h2>
            {transaction.merchantName && transaction.merchantName !== transaction.name && (
              <p className="text-sm text-gray-500">Merchant: {transaction.merchantName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
            <div
              className={`text-3xl font-bold ${
                transaction.kind === "transfer"
                  ? "text-gray-500"
                  : transaction.amount > 0
                  ? "text-red-600"
                  : "text-green-600"
              }`}
            >
              {formatSignedAmount(transaction.amount)}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {/* Labelled by kind, not by sign — a transfer moves money in one
                  direction but is neither an expense nor income. */}
              {transaction.kind === "transfer"
                ? "Transfer — excluded from income and spending"
                : transaction.kind === "income"
                ? "Income"
                : transaction.amount < 0
                ? "Refund"
                : "Expense"}
            </p>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <p className="text-gray-900">
                {new Date(transaction.date).toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  // Stored at UTC midnight; without this it renders a day early.
                  timeZone: "UTC",
                })}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Account</label>
              <p className="text-gray-900">{transaction.account.name}</p>
              <p className="text-xs text-gray-500">{transaction.account.institutionName}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <div className="flex items-center gap-2">
                {transaction.pending ? (
                  <span className="px-2 py-1 bg-amber-100 text-amber-800 text-xs rounded-full font-medium">
                    Pending
                  </span>
                ) : (
                  <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full font-medium">
                    Posted
                  </span>
                )}
                {transaction.isManual && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">
                    Manual
                  </span>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Transaction ID</label>
              <p className="text-xs text-gray-500 font-mono">{transaction.id.slice(0, 16)}...</p>
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            {editing ? (
              <>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as TransactionKind)}
                  className="w-full rounded border px-3 py-2"
                >
                  {(Object.keys(KIND_LABELS) as TransactionKind[]).map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
                {transaction.kind === "transfer" && kind !== "transfer" && transaction.transferPairId && (
                  <p className="text-xs text-amber-600 mt-1">
                    This will unpair it from its matched transfer on the other account.
                  </p>
                )}
              </>
            ) : (
              <span className="px-3 py-2 bg-gray-50 rounded border text-gray-900 inline-block">
                {KIND_LABELS[transaction.kind]}
              </span>
            )}
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            {editing ? (
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={kind === "transfer"}
                className="w-full rounded border px-3 py-2 disabled:bg-gray-100 disabled:text-gray-400"
              >
                <option value="">Uncategorized</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-2">
                <span className="px-3 py-2 bg-gray-50 rounded border text-gray-900">
                  {transaction.category?.name || "Uncategorized"}
                </span>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            {editing ? (
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about this transaction..."
                className="w-full rounded border px-3 py-2 min-h-[100px]"
              />
            ) : (
              <div className="px-3 py-2 bg-gray-50 rounded border text-gray-900 min-h-[100px]">
                {transaction.notes || (
                  <span className="text-gray-400 italic">No notes</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t p-6 flex justify-end gap-3">
          {editing ? (
            <>
              <button
                onClick={() => {
                  setEditing(false);
                  setCategoryId(transaction.categoryId || "");
                  setKind(transaction.kind);
                  setNotes(transaction.notes || "");
                }}
                className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveChanges}
                disabled={saving}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              <button
                onClick={() => setEditing(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                Edit
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
