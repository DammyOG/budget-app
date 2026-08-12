import { useState } from "react";
import { Link } from "react-router-dom";

const DISMISSED_KEY = "onboarding_dismissed";

const PAGES = [
  { to: "/", icon: "📊", name: "Dashboard", description: "Net worth, income vs. spending, and budget progress at a glance." },
  { to: "/income-spending", icon: "📈", name: "Income & Spending", description: "Deep-dive by category and month, and clean up transfers that shouldn't count as income or spending." },
  { to: "/accounts", icon: "🏦", name: "Accounts", description: "Link banks via Plaid, add accounts you track by hand, and manage balances." },
  { to: "/transactions", icon: "🧾", name: "Transactions", description: "Search, filter, and categorize every transaction." },
  { to: "/budgets", icon: "🎯", name: "Budgets", description: "Set a monthly spending limit per category and track progress." },
  { to: "/recurring", icon: "🔁", name: "Recurring", description: "Subscriptions and bills detected from your transaction history." },
  { to: "/review", icon: "✅", name: "Review", description: "Train the auto-categorizer by confirming or correcting transactions one at a time." },
  { to: "/transfers", icon: "⇄", name: "Transfers", description: "Review and link money moving between your own accounts." },
];

// A first-time user landing on 8 nav items with no explanation has to guess
// what half of them do (what's the difference between Review and Income &
// Spending's "clean up transfers"?). Shown once, dismissed permanently after.
export default function OnboardingIntro() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === "true");

  if (dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "true");
    setDismissed(true);
  };

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 relative">
      <button
        onClick={dismiss}
        className="absolute top-3 right-3 text-indigo-400 hover:text-indigo-700 text-xl leading-none"
        aria-label="Dismiss"
      >
        ×
      </button>
      <h2 className="font-semibold text-indigo-900 mb-3">Where to find things</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PAGES.map((p) => (
          <Link
            key={p.to}
            to={p.to}
            onClick={dismiss}
            className="flex gap-2 rounded-md bg-white/60 hover:bg-white p-2 -m-0.5 transition-colors"
          >
            <span className="text-lg shrink-0">{p.icon}</span>
            <span>
              <span className="block text-sm font-medium text-indigo-900">{p.name}</span>
              <span className="block text-xs text-indigo-700">{p.description}</span>
            </span>
          </Link>
        ))}
      </div>
      <button onClick={dismiss} className="mt-3 text-xs text-indigo-600 hover:text-indigo-800 underline">
        Got it, don't show this again
      </button>
    </div>
  );
}
