import { NavLink, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Accounts from "./pages/Accounts";
import Transactions from "./pages/Transactions";
import Budgets from "./pages/Budgets";
import IncomeSpending from "./pages/IncomeSpending";
import Transfers from "./pages/Transfers";
import Recurring from "./pages/Recurring";
import OAuthReturn from "./pages/OAuthReturn";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-md text-sm font-medium ${
    isActive ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-200"
  }`;

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <span className="text-lg font-semibold">💰 Budget App</span>
          <nav className="flex gap-2">
            <NavLink to="/" end className={navLinkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/income-spending" className={navLinkClass}>
              Income & Spending
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
            <NavLink to="/transfers" className={navLinkClass}>
              Transfers
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/income-spending" element={<IncomeSpending />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/budgets" element={<Budgets />} />
          <Route path="/recurring" element={<Recurring />} />
          <Route path="/transfers" element={<Transfers />} />
          <Route path="/oauth-return" element={<OAuthReturn />} />
        </Routes>
      </main>
    </div>
  );
}
