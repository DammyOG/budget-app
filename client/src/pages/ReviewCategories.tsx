import { useEffect, useState } from "react";
import { api, formatCurrency, Transaction, Category } from "../lib/api";

export default function ReviewCategories() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showCustomCategory, setShowCustomCategory] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [stats, setStats] = useState({ reviewed: 0, corrected: 0, total: 0 });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [txs, cats] = await Promise.all([
        api.getTransactions({}),
        api.getCategories(),
      ]);

      // Get all transactions, prioritize uncategorized
      const uncategorized = txs.filter((t) => !t.categoryId);
      const categorized = txs.filter((t) => t.categoryId);

      setTransactions([...uncategorized, ...categorized]);
      setCategories(cats);
      setStats({ reviewed: 0, corrected: 0, total: txs.length });
    } catch (err: any) {
      alert(`Failed to load: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  const currentTransaction = transactions[currentIndex];
  const hasMore = currentIndex < transactions.length - 1;
  const progress = transactions.length > 0 ? ((currentIndex / transactions.length) * 100) : 0;

  async function handleCorrect() {
    if (!currentTransaction) return;

    setStats((s) => ({ ...s, reviewed: s.reviewed + 1 }));

    if (hasMore) {
      setCurrentIndex(currentIndex + 1);
    } else {
      showCompletionMessage();
    }
  }

  async function handleWrong() {
    setShowCustomCategory(true);
  }

  async function submitCorrection() {
    if (!currentTransaction || !selectedCategoryId) return;

    setProcessing(true);
    try {
      await api.updateTransaction(currentTransaction.id, {
        categoryId: selectedCategoryId,
      });

      setStats((s) => ({ ...s, reviewed: s.reviewed + 1, corrected: s.corrected + 1 }));
      setShowCustomCategory(false);
      setSelectedCategoryId("");

      if (hasMore) {
        setCurrentIndex(currentIndex + 1);
      } else {
        showCompletionMessage();
      }
    } catch (err: any) {
      alert(`Failed to update: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  }

  function showCompletionMessage() {
    alert(
      `🎉 Review Complete!\n\n` +
      `Reviewed: ${stats.reviewed + 1} transactions\n` +
      `Corrected: ${stats.corrected} categories\n` +
      `Accuracy: ${stats.reviewed > 0 ? (((stats.reviewed - stats.corrected) / stats.reviewed) * 100).toFixed(1) : 0}%`
    );
    loadData();
    setCurrentIndex(0);
  }

  function skip() {
    if (hasMore) {
      setCurrentIndex(currentIndex + 1);
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Review & Train Categorization</h1>
        <p>Loading transactions...</p>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Review & Train Categorization</h1>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
          <p className="text-blue-900 font-medium mb-2">No Transactions to Review</p>
          <p className="text-sm text-blue-800">
            Link a bank account and sync transactions to start training the categorization system.
          </p>
        </div>
      </div>
    );
  }

  if (!currentTransaction) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Review & Train Categorization</h1>
        <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
          <p className="text-green-900 font-medium mb-2">🎉 All Done!</p>
          <p className="text-sm text-green-800">
            You've reviewed all transactions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Review & Train Categorization</h1>
        <p className="text-gray-600">
          Help improve categorization accuracy by reviewing transactions one by one
        </p>
      </div>

      {/* Progress */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>
            Transaction {currentIndex + 1} of {transactions.length}
          </span>
          <span>{progress.toFixed(0)}% complete</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-600 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-sm text-gray-500">Reviewed</div>
          <div className="text-2xl font-bold text-indigo-600">{stats.reviewed}</div>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-sm text-gray-500">Corrected</div>
          <div className="text-2xl font-bold text-orange-600">{stats.corrected}</div>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-sm text-gray-500">Remaining</div>
          <div className="text-2xl font-bold text-gray-600">{transactions.length - currentIndex}</div>
        </div>
      </div>

      {/* Transaction Card */}
      <div className="bg-white rounded-lg shadow-lg border-2 border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-6 border-b">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900 mb-1">
                {currentTransaction.name}
              </h2>
              {currentTransaction.merchantName && currentTransaction.merchantName !== currentTransaction.name && (
                <p className="text-sm text-gray-600">
                  Merchant: {currentTransaction.merchantName}
                </p>
              )}
            </div>
            <div className="text-right">
              <div className={`text-3xl font-bold ${currentTransaction.amount > 0 ? "text-red-600" : "text-green-600"}`}>
                {formatCurrency(currentTransaction.amount)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {currentTransaction.amount > 0 ? "Expense" : "Income"}
              </div>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Date:</span>
              <span className="ml-2 font-medium text-gray-900">
                {new Date(currentTransaction.date).toLocaleDateString()}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Account:</span>
              <span className="ml-2 font-medium text-gray-900">
                {currentTransaction.account.name}
              </span>
            </div>
          </div>

          {/* Current Category */}
          <div className="bg-gray-50 rounded-lg p-4 border-2 border-gray-200">
            <div className="text-sm text-gray-600 mb-2">Current Category:</div>
            <div className="flex items-center gap-2">
              {currentTransaction.category ? (
                <span className="px-4 py-2 bg-white rounded-lg border-2 border-indigo-200 text-indigo-900 font-semibold text-lg">
                  {currentTransaction.category.name}
                </span>
              ) : (
                <span className="px-4 py-2 bg-yellow-50 rounded-lg border-2 border-yellow-300 text-yellow-800 font-semibold text-lg">
                  ⚠️ Uncategorized
                </span>
              )}
            </div>
          </div>

          {/* Question */}
          <div className="text-center py-4">
            <p className="text-xl font-semibold text-gray-900">
              Is this category correct?
            </p>
          </div>

          {/* Action Buttons */}
          {!showCustomCategory ? (
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={handleCorrect}
                className="py-4 px-6 bg-green-500 hover:bg-green-600 text-white rounded-lg font-semibold text-lg shadow-lg transform transition hover:scale-105"
              >
                ✓ Yes, Correct
              </button>
              <button
                onClick={handleWrong}
                className="py-4 px-6 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold text-lg shadow-lg transform transition hover:scale-105"
              >
                ✗ No, Wrong
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select the correct category:
                </label>
                <select
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  className="w-full rounded-lg border-2 border-gray-300 px-4 py-3 text-lg"
                  autoFocus
                >
                  <option value="">Choose a category...</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => {
                    setShowCustomCategory(false);
                    setSelectedCategoryId("");
                  }}
                  className="py-3 px-6 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={submitCorrection}
                  disabled={!selectedCategoryId || processing}
                  className="py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? "Saving..." : "Save & Continue"}
                </button>
              </div>
            </div>
          )}

          {/* Skip Button */}
          {!showCustomCategory && (
            <div className="text-center">
              <button
                onClick={skip}
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                Skip this transaction
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
