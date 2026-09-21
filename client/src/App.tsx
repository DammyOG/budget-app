import { Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import Dashboard from "./pages/Dashboard";
import Accounts from "./pages/Accounts";
import Transactions from "./pages/Transactions";
import Budgets from "./pages/Budgets";
import IncomeSpending from "./pages/IncomeSpending";
import Transfers from "./pages/Transfers";
import Recurring from "./pages/Recurring";
import ReviewCategories from "./pages/ReviewCategories";
import OAuthReturn from "./pages/OAuthReturn";

export default function App() {
  return (
    <AppShell>
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
    </AppShell>
  );
}
