import "dotenv/config";
import express from "express";
import cors from "cors";
import { prisma } from "./db";

import plaidRoutes from "./routes/plaid";
import accountsRoutes from "./routes/accounts";
import transactionsRoutes from "./routes/transactions";
import categoriesRoutes from "./routes/categories";
import budgetsRoutes from "./routes/budgets";
import dashboardRoutes from "./routes/dashboard";
import transfersRoutes from "./routes/transfers";

const DEFAULT_CATEGORIES = [
  { name: "Groceries", isIncome: false },
  { name: "Dining & Restaurants", isIncome: false },
  { name: "Rent & Mortgage", isIncome: false },
  { name: "Utilities", isIncome: false },
  { name: "Transportation", isIncome: false },
  { name: "Shopping", isIncome: false },
  { name: "Entertainment", isIncome: false },
  { name: "Health & Fitness", isIncome: false },
  { name: "Travel", isIncome: false },
  { name: "Subscriptions", isIncome: false },
  { name: "Insurance", isIncome: false },
  { name: "Personal Care", isIncome: false },
  { name: "Education", isIncome: false },
  { name: "Gifts & Donations", isIncome: false },
  { name: "Fees & Charges", isIncome: false },
  { name: "Transfer", isIncome: false },
  { name: "Zelle Sent", isIncome: false },
  { name: "Zelle Received", isIncome: true },
  { name: "Salary", isIncome: true },
  { name: "Freelance", isIncome: true },
  { name: "Investment Income", isIncome: true },
  { name: "Rewards & Cashback", isIncome: true },
  { name: "Other Income", isIncome: true },
];

async function seedCategories() {
  for (const cat of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { name: cat.name },
      create: { name: cat.name, isIncome: cat.isIncome },
      update: { isIncome: cat.isIncome },
    });
  }
}

async function main() {
  await seedCategories();

  const app = express();
  app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
  app.use(express.json());

  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.use("/api/plaid", plaidRoutes);
  app.use("/api/accounts", accountsRoutes);
  app.use("/api/transactions", transactionsRoutes);
  app.use("/api/categories", categoriesRoutes);
  app.use("/api/budgets", budgetsRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/transfers", transfersRoutes);

  const port = Number(process.env.PORT) || 4000;
  app.listen(port, () => console.log(`Budget app server listening on http://localhost:${port}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
