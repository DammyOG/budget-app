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

// A first-time user still benefits from knowing what eight destinations do,
// but expanded by default this pushed the entire dashboard below the fold on
// a phone — a screen and a half of explanation before a single number. It
// now starts as one line and opens on request.
export default function OnboardingIntro() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === "true");
  const [open, setOpen] = useState(false);

  if (dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "true");
    setDismissed(true);
  };

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50">
      <div className="flex items-center gap-2 p-2 pl-4">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-[40px] flex-1 items-center gap-2 text-left text-sm font-medium text-indigo-900"
          aria-expanded={open}
        >
          <span>👋</span>
          <span className="flex-1">New here? Where to find things</span>
          <span className="text-indigo-400">{open ? "▴" : "▾"}</span>
        </button>
        <button
          onClick={dismiss}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl leading-none text-indigo-400 active:bg-indigo-100"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>

      {open && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PAGES.map((p) => (
              <Link
                key={p.to}
                to={p.to}
                onClick={dismiss}
                className="flex gap-2 rounded-lg bg-white/70 p-2 transition-colors active:bg-white"
              >
                <span className="shrink-0 text-lg">{p.icon}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-indigo-900">{p.name}</span>
                  <span className="block text-xs text-indigo-700">{p.description}</span>
                </span>
              </Link>
            ))}
          </div>
          <button onClick={dismiss} className="mt-3 min-h-[40px] text-xs text-indigo-600 underline">
            Got it, don't show this again
          </button>
        </div>
      )}
    </div>
  );
}
