import { prisma } from "../db";

// A genuine double-charge looks like the exact same merchant billing the exact
// same amount to the same account on the same day. Deliberately strict:
// widening to "within a day or two" starts catching legitimate repeat
// purchases (two coffees, two tolls) and a false duplicate flag on real
// spending is worse than missing an occasional real one.
export interface DuplicateKey {
  accountId: string;
  name: string;
  amount: number;
  date: Date;
}

export function keyOf(d: { accountId: string; name: string; amount: number; date: Date | string }): string {
  const date = typeof d.date === "string" ? d.date : d.date.toISOString();
  return [d.accountId, d.name, d.amount, date.slice(0, 10)].join("\u0000");
}

// The (account, name, amount, date) tuples that occur more than once.
export async function findDuplicateGroups(where: any = {}): Promise<DuplicateKey[]> {
  const groups = await prisma.transaction.groupBy({
    by: ["accountId", "name", "amount", "date"],
    where,
    _count: { _all: true },
    having: { id: { _count: { gt: 1 } } },
  });

  return groups.map((g) => ({ accountId: g.accountId, name: g.name, amount: g.amount, date: g.date }));
}

// Returns the set of group keys that have more than one transaction, so a
// list can mark the rows belonging to them without an extra query per row.
export async function findDuplicateKeys(where: any = {}): Promise<Set<string>> {
  return new Set((await findDuplicateGroups(where)).map(keyOf));
}

// Turns those groups into a where-clause fragment, so "show me only the
// duplicates" narrows the query itself. Filtering the fetched page instead
// would leave the total count and pagination describing the unfiltered set.
export function duplicateGroupFilter(groups: DuplicateKey[]) {
  return groups.map((g) => ({
    accountId: g.accountId,
    name: g.name,
    amount: g.amount,
    date: g.date,
  }));
}

export function isDuplicate(
  tx: { accountId: string; name: string; amount: number; date: Date | string },
  duplicateKeys: Set<string>
): boolean {
  return duplicateKeys.has(keyOf(tx));
}

// Full rows for the duplicates, for the "needs attention" view. Bounded by
// the caller's where clause rather than scanning all history.
export async function listDuplicates(where: any = {}, limit = 100) {
  const keys = await findDuplicateKeys(where);
  if (keys.size === 0) return [];

  const candidates = await prisma.transaction.findMany({
    where,
    orderBy: [{ date: "desc" }, { id: "asc" }],
    include: { account: { select: { name: true, institutionName: true } }, category: true },
  });

  return candidates.filter((tx) => keys.has(keyOf(tx))).slice(0, limit);
}
