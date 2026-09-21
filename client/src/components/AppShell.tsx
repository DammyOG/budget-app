import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { Sheet } from "./ui";

// Eight links in a horizontally scrolling strip meant that on a phone you saw
// "Dashboard" and half of "Income & S…" — the other six destinations were
// invisible with no scrollbar to hint they existed. Phones get a fixed bottom
// tab bar for the five destinations you actually move between, plus a More
// sheet; wider screens keep the full row in the header, where it fits.

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
}

const PRIMARY: NavItem[] = [
  { to: "/", label: "Home", icon: "🏠", end: true },
  { to: "/transactions", label: "Activity", icon: "📋" },
  { to: "/accounts", label: "Accounts", icon: "🏦" },
  { to: "/budgets", label: "Budgets", icon: "🎯" },
];

const SECONDARY: NavItem[] = [
  { to: "/income-spending", label: "Income & Spending", icon: "📈" },
  { to: "/recurring", label: "Recurring", icon: "🔁" },
  { to: "/review", label: "Review", icon: "✅" },
  { to: "/transfers", label: "Transfers", icon: "⇄" },
];

const ALL = [...PRIMARY, ...SECONDARY];

export default function AppShell({ children }: { children: ReactNode }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  const onSecondary = SECONDARY.some((i) => i.to === pathname);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <span className="shrink-0 text-base font-semibold sm:text-lg">💰 Budget App</span>
          {/* Desktop only: on a phone this is the bottom bar instead. */}
          <nav className="hidden flex-wrap gap-1 md:flex">
            {ALL.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
                    isActive ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      {/* pb-24 on mobile keeps the last row of content above the tab bar. */}
      <main className="mx-auto max-w-6xl overflow-x-hidden px-4 pb-24 pt-4 md:pb-10">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="mx-auto flex max-w-md">
          {PRIMARY.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                  isActive ? "text-indigo-600" : "text-slate-500"
                }`
              }
            >
              <span className="text-lg leading-none">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
              onSecondary ? "text-indigo-600" : "text-slate-500"
            }`}
          >
            <span className="text-lg leading-none">⋯</span>
            More
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="flex flex-col gap-1">
          {SECONDARY.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMoreOpen(false)}
              className={({ isActive }) =>
                `flex min-h-[52px] items-center gap-3 rounded-xl px-3 text-sm font-medium ${
                  isActive ? "bg-indigo-50 text-indigo-700" : "text-slate-700 active:bg-slate-100"
                }`
              }
            >
              <span className="text-xl">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
