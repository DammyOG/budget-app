import "dotenv/config";
import express from "express";
import cors from "cors";
import { prisma } from "./db";
import { catchAsyncErrors, errorHandler } from "./asyncErrors";

import plaidRoutes from "./routes/plaid";
import accountsRoutes from "./routes/accounts";
import transactionsRoutes from "./routes/transactions";
import categoriesRoutes from "./routes/categories";
import budgetsRoutes from "./routes/budgets";
import dashboardRoutes from "./routes/dashboard";
import transfersRoutes from "./routes/transfers";
import recurringRoutes from "./routes/recurring";

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

  // Rules taught before rules were keyed by merchant still hold a raw bank
  // descriptor. Rewriting them here rather than in the migration because
  // normalization is code, not SQL. Idempotent, so it's a no-op once done.
  const { normalizeExistingRules } = await import("./services/categorizationLearning");
  const rewritten = await normalizeExistingRules();
  if (rewritten > 0) console.log(`Normalized ${rewritten} categorization rule(s) to merchant keys`);

  const app = express();
  app.use(cors({ origin: process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(",") : true }));
  app.use(express.json());

  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.use("/api/plaid", catchAsyncErrors(plaidRoutes));
  app.use("/api/accounts", catchAsyncErrors(accountsRoutes));
  app.use("/api/transactions", catchAsyncErrors(transactionsRoutes));
  app.use("/api/categories", catchAsyncErrors(categoriesRoutes));
  app.use("/api/budgets", catchAsyncErrors(budgetsRoutes));
  app.use("/api/dashboard", catchAsyncErrors(dashboardRoutes));
  app.use("/api/transfers", catchAsyncErrors(transfersRoutes));
  app.use("/api/recurring", catchAsyncErrors(recurringRoutes));

  app.use(errorHandler);

  const port = Number(process.env.PORT) || 4000;
  const server = app.listen(port, () =>
    console.log(`Budget app server listening on http://localhost:${port}`)
  );

  // Without a handler this is an unhandled 'error' event: a 25-line stack
  // ending in EADDRINUSE, which looks like the app is broken when in fact
  // another copy is already running — usually one left behind in a different
  // terminal or tmux pane.
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `\nPort ${port} is already in use — another copy of this server is probably still running.\n` +
          `  Find it:  lsof -i :${port}     (or: ss -ltnp | grep ${port})\n` +
          `  Stop it:  kill $(lsof -t -i :${port})\n` +
          `  Or run this one elsewhere:  PORT=4001 npm run dev\n`
      );
      process.exit(1);
    }
    throw err;
  });

  // tsx watch supervises this process; exiting promptly on a signal keeps
  // Ctrl+C from leaving the port held by a lingering child.
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      server.close(() => process.exit(0));
      // Don't let an open keep-alive connection hold the shutdown open.
      setTimeout(() => process.exit(0), 2000).unref();
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
