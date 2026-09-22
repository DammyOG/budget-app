import { prisma } from "../db";
import { merchantKey, merchantTokens } from "./merchantKey";

// A naive Bayes classifier over merchant tokens, trained on the transactions
// you have already categorized — your own answers, not a fixed rule list.
//
// The built-in regex rules only know merchants someone thought to write down.
// Anything else stayed uncategorized forever, which is why categorizing felt
// like it never finished. This generalizes instead: once "BLUE BOTTLE COFFEE"
// is Dining, a later "BLUE BOTTLE" charge scores toward Dining on the shared
// token, and so does "PARTNERS COFFEE" on the weaker "coffee" signal.
//
// Deliberately kept to token counts rather than anything heavier: it trains in
// milliseconds on a personal ledger, needs no dependencies, and its decisions
// can be explained back to you in a sentence.

export interface Prediction {
  categoryId: string;
  categoryName: string;
  // 0-1. The gap between the best and second-best category, so a merchant that
  // looks equally like Groceries and Dining reports low confidence rather than
  // a coin flip presented as fact.
  confidence: number;
  reason: string;
}

interface Model {
  // category id -> token -> count
  tokenCounts: Map<string, Map<string, number>>;
  categoryTotals: Map<string, number>; // total tokens seen per category
  categoryDocs: Map<string, number>; // transactions per category (the prior)
  categoryNames: Map<string, string>;
  vocabulary: Set<string>;
  totalDocs: number;
}

// Transfers are excluded from training: they carry no category and their
// descriptors ("PAYMENT THANK YOU") would otherwise pollute real categories.
export async function trainModel(): Promise<Model> {
  const rows = await prisma.transaction.findMany({
    where: { categoryId: { not: null }, kind: { not: "transfer" } },
    select: { name: true, categoryId: true, category: { select: { name: true } } },
  });

  const model: Model = {
    tokenCounts: new Map(),
    categoryTotals: new Map(),
    categoryDocs: new Map(),
    categoryNames: new Map(),
    vocabulary: new Set(),
    totalDocs: 0,
  };

  for (const row of rows) {
    const categoryId = row.categoryId!;
    const tokens = merchantTokens(row.name);
    if (tokens.length === 0) continue;

    model.categoryNames.set(categoryId, row.category?.name ?? "");
    model.categoryDocs.set(categoryId, (model.categoryDocs.get(categoryId) ?? 0) + 1);
    model.totalDocs++;

    let counts = model.tokenCounts.get(categoryId);
    if (!counts) {
      counts = new Map();
      model.tokenCounts.set(categoryId, counts);
    }
    for (const token of tokens) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
      model.categoryTotals.set(categoryId, (model.categoryTotals.get(categoryId) ?? 0) + 1);
      model.vocabulary.add(token);
    }
  }

  return model;
}

// Below this there isn't enough history for a guess to mean anything, and
// guessing from two examples would teach the user to distrust the whole thing.
const MIN_TRAINING_DOCS = 8;

export function predict(model: Model, name: string): Prediction | null {
  if (model.totalDocs < MIN_TRAINING_DOCS) return null;

  const tokens = merchantTokens(name);
  if (tokens.length === 0) return null;

  // A token nobody has ever seen carries no signal; if none of them are known,
  // the "prediction" would be the prior alone, which is just "your most common
  // category" dressed up as an answer.
  const knownTokens = tokens.filter((t) => model.vocabulary.has(t));
  if (knownTokens.length === 0) return null;

  const vocabSize = model.vocabulary.size;
  const scores: { categoryId: string; score: number }[] = [];

  for (const [categoryId, docs] of model.categoryDocs) {
    const counts = model.tokenCounts.get(categoryId)!;
    const total = model.categoryTotals.get(categoryId) ?? 0;

    let score = Math.log(docs / model.totalDocs); // prior
    for (const token of knownTokens) {
      // Laplace smoothing, so one unseen token in an otherwise strong match
      // doesn't drive the probability to zero.
      score += Math.log(((counts.get(token) ?? 0) + 1) / (total + vocabSize));
    }
    scores.push({ categoryId, score });
  }

  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  const runnerUp = scores[1];
  if (!best) return null;

  // Convert the log-odds gap between first and second place into 0-1. A clear
  // winner approaches 1; a near-tie approaches 0.
  const gap = runnerUp ? best.score - runnerUp.score : 4;
  const confidence = Math.min(1, Math.max(0, 1 - Math.exp(-gap / 2)));

  const matched = knownTokens.join(", ");
  return {
    categoryId: best.categoryId,
    categoryName: model.categoryNames.get(best.categoryId) ?? "",
    confidence,
    reason: `matched ${matched} against transactions you've already categorized`,
  };
}

// Applied automatically at or above this; below it the guess is offered for
// confirmation instead of being written to the ledger silently.
export const AUTO_APPLY_CONFIDENCE = 0.8;

export type TrainedModel = Model;

// Convenience for callers that classify a single name and don't hold a model.
export async function predictOne(name: string): Promise<Prediction | null> {
  return predict(await trainModel(), name);
}

export { merchantKey };
