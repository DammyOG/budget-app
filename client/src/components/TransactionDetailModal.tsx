import { useState } from "react";
import { api, formatCurrency, Transaction, Category } from "../lib/api";

interface Props {
  transaction: Transaction;
  categories: Category[];
  onClose: () => void;
  onUpdate: () => void;
}

export default function TransactionDetailModal({ transaction, categories, onClose, onUpdate }: Props) {
  const [editing, setEditing] = useState(false);
  const [categoryId, setCategoryId] = useState(transaction.categoryId || "");
  const [notes, setNotes] = useState(transaction.notes || "");
  const [saving, setSaving] = useState(false);

  const saveChanges = async () => {
    setSaving(true);
    try {
      await api.updateTransaction(transaction.id, {
        categoryId: categoryId || null,
        notes: notes || null,
      });
      onUpdate();
      setEditing(false);
    } catch (err) {
      alert("Failed to save changes");
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
            <div className={`text-3xl font-bold ${transaction.amount > 0 ? "text-red-600" : "text-green-600"}`}>
              {formatCurrency(transaction.amount)}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {transaction.amount > 0 ? "Expense" : "Income"}
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

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            {editing ? (
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded border px-3 py-2"
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
