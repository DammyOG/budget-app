import { useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Accounts from "./pages/Accounts";
import Transactions from "./pages/Transactions";
import Budgets from "./pages/Budgets";
import IncomeSpending from "./pages/IncomeSpending";
import Transfers from "./pages/Transfers";
import Recurring from "./pages/Recurring";
import ReviewCategories from "./pages/ReviewCategories";
import OAuthReturn from "./pages/OAuthReturn";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-md text-sm font-medium block ${
    isActive ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-200"
  }`;

export default function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white sticky top-0 z-50 shadow-sm">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold">💰 Budget App</span>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-md text-slate-600 hover:bg-slate-100"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>

            {/* Desktop navigation */}
            <nav className="hidden md:flex gap-2">
              <NavLink to="/" end className={navLinkClass}>
                Dashboard
              </NavLink>
              <NavLink to="/income-spending" className={navLinkClass}>
                Income
              </NavLink>
              <NavLink to="/accounts" className={navLinkClass}>
                Accounts
              </NavLink>
              <NavLink to="/transactions" className={navLinkClass}>
                Transactions
              </NavLink>
              <NavLink to="/budgets" className={navLinkClass}>
                Budgets
              </NavLink>
              <NavLink to="/recurring" className={navLinkClass}>
                Recurring
              </NavLink>
              <NavLink to="/review" className={navLinkClass}>
                Review
              </NavLink>
              <NavLink to="/transfers" className={navLinkClass}>
                Transfers
              </NavLink>
            </nav>
          </div>

          {/* Mobile navigation */}
          {mobileMenuOpen && (
            <nav className="md:hidden mt-3 pb-3 space-y-1">
              <NavLink to="/" end className={navLinkClass} onClick={() => setMobileMenuOpen(false)}>
                Dashboard
              </NavLink>
              <NavLink to="/income-spending" className={navLinkClass} onClick={() => setMobileMenuOpen(false)}>
                Income & Spending
              </NavLink>
              <NavLink to="/accounts" className={navLinkClass} onClick={() => setMobileMenuOpen(false)}>
                Accounts
              </NavLink>
              <NavLink to="/transactions" className={navLinkClass} onClick={() => setMobileMenuOpen(false)}>
                Transactions
              </NavLink>
              <NavLink to="/budgets" className={navLinkClass} onClick={() => setMobileMenuOpen(false)}>
                Budgets
              </NavLink>
              <NavLink to="/recurring" className={navLinkClass} onClick={() => setMobileMenuOpen(false)}>
                Recurring
              </NavLink>
              <NavLink to="/review" className={navLinkClass} onClick={() => setMobileMenuOpen(false)}>
                Review
              </NavLink>
              <NavLink to="/transfers" className={navLinkClass} onClick={() => setMobileMenuOpen(false)}>
                Transfers
              </NavLink>
            </nav>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-4 md:py-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/income-spending" element={<IncomeSpending />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/budgets" element={<Budgets />} />
          <Route path="/recurring" element={<Recurring />} />
          <Route path="/review" element={<ReviewCategories />} />
          <Route path="/transfers" element={<Transfers />} />
          <Route path="/oauth-return" element={<OAuthReturn />} />
        </Routes>
      </main>
    </div>
  );
}
