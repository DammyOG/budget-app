import { PrismaClient } from "@prisma/client";

const base = new PrismaClient();

// absAmount is derived from amount, never set by hand. Doing it here rather
// than at each write site means no future code path can forget it and end up
// with a transaction that sorts as if it were $0 — the same failure mode that
// made centralizing "kind" worthwhile.
//
// Only plain numbers are derived from: Prisma also accepts atomic forms like
// { amount: { increment: 5 } }, where the resulting value isn't knowable here.
function deriveAbsAmount<T>(data: T): T {
  if (!data || typeof data !== "object") return data;
  const amount = (data as { amount?: unknown }).amount;
  if (typeof amount !== "number") return data;
  return { ...data, absAmount: Math.abs(amount) };
}

export const prisma = base.$extends({
  query: {
    transaction: {
      async create({ args, query }) {
        args.data = deriveAbsAmount(args.data);
        return query(args);
      },
      async update({ args, query }) {
        args.data = deriveAbsAmount(args.data);
        return query(args);
      },
      async updateMany({ args, query }) {
        args.data = deriveAbsAmount(args.data);
        return query(args);
      },
      async upsert({ args, query }) {
        args.create = deriveAbsAmount(args.create);
        args.update = deriveAbsAmount(args.update);
        return query(args);
      },
      async createMany({ args, query }) {
        args.data = Array.isArray(args.data)
          ? args.data.map(deriveAbsAmount)
          : deriveAbsAmount(args.data);
        return query(args);
      },
    },
  },
});
