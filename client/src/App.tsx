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
  `px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap shrink-0 ${
    isActive ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-200"
  }`;

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-4">
          <span className="text-lg font-semibold shrink-0">💰 Budget App</span>
          {/* Scrolls within itself instead of forcing the whole page wider
              than the viewport — 8 links don't fit a phone screen otherwise. */}
          <nav className="flex gap-2 overflow-x-auto">
            <NavLink to="/" end className={navLinkClass} title="Net worth, income vs. spending, and budget progress">
              Dashboard
            </NavLink>
            <NavLink
              to="/income-spending"
              className={navLinkClass}
              title="Income and expenses by category and month; clean up transfers"
            >
              Income & Spending
            </NavLink>
            <NavLink to="/accounts" className={navLinkClass} title="Link banks, add manual accounts, manage balances">
              Accounts
            </NavLink>
            <NavLink
              to="/transactions"
              className={navLinkClass}
              title="Search, filter, and categorize every transaction"
            >
              Transactions
            </NavLink>
            <NavLink to="/budgets" className={navLinkClass} title="Set and track monthly spending limits by category">
              Budgets
            </NavLink>
            <NavLink to="/recurring" className={navLinkClass} title="Subscriptions and bills detected automatically">
              Recurring
            </NavLink>
            <NavLink
              to="/review"
              className={navLinkClass}
              title="Train the auto-categorizer by reviewing transactions"
            >
              Review
            </NavLink>
            <NavLink
              to="/transfers"
              className={navLinkClass}
              title="Review and link money moving between your own accounts"
            >
              Transfers
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 overflow-x-hidden">
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
