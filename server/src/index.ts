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

const DEFAULT_CATEGORIES = [
  "Groceries",
  "Dining & Restaurants",
  "Rent & Mortgage",
  "Utilities",
  "Transportation",
  "Shopping",
  "Entertainment",
  "Health & Fitness",
  "Travel",
  "Subscriptions",
  "Insurance",
  "Personal Care",
  "Education",
  "Gifts & Donations",
  "Fees & Charges",
  "Transfer",
  "Income",
];

async function seedCategories() {
  for (const name of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { name },
      create: { name, isIncome: name === "Income" },
      update: {},
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

  const port = Number(process.env.PORT) || 4000;
  app.listen(port, () => console.log(`Budget app server listening on http://localhost:${port}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
