import type { BacktestReport, BacktestThresholdResult, SignalScore } from "@/types";
import { addDays } from "./dates";
import { type PriceSeries, forwardReturn } from "./market";

export type { BacktestReport };

export interface BacktestInput {
  ticker: string;
  scores: SignalScore[];
  stock: PriceSeries;
  sector: PriceSeries;
}

export interface SignalOutcome {
  ticker: string;
  date: string;
  score: number;
  alpha: number;
}

/**
 * Entry signals: the first day a ticker's score is at or above the threshold
 * after a day below it. Counting every day above the threshold would count one
 * episode many times over.
 */
export function entrySignals(input: BacktestInput, threshold: number, lastSignalDate: string): { date: string; score: number }[] {
  const signals: { date: string; score: number }[] = [];
  let above = true; // Ignore a score that is already elevated on the first day.
  for (const s of input.scores) {
    const isAbove = s.total_score >= threshold;
    if (isAbove && !above && s.date <= lastSignalDate) signals.push({ date: s.date, score: s.total_score });
    above = isAbove;
  }
  return signals;
}

export function outcomes(inputs: BacktestInput[], threshold: number, horizonDays: number, lastSignalDate: string): SignalOutcome[] {
  const results: SignalOutcome[] = [];
  for (const input of inputs) {
    for (const signal of entrySignals(input, threshold, lastSignalDate)) {
      const end = addDays(signal.date, horizonDays);
      // Enter on the next session, since the score uses that day's close.
      const entry = addDays(signal.date, 1);
      const stock = forwardReturn(input.stock, entry, end);
      const sector = forwardReturn(input.sector, entry, end);
      if (stock === null || sector === null) continue;
      results.push({ ticker: input.ticker, date: signal.date, score: signal.score, alpha: stock - sector });
    }
  }
  return results;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function summarizeOutcomes(threshold: number, results: SignalOutcome[]): BacktestThresholdResult {
  if (results.length === 0) {
    return { threshold, signals: 0, average_alpha: null, median_alpha: null, hit_rate: null };
  }
  const alphas = results.map((r) => r.alpha);
  return {
    threshold,
    signals: results.length,
    average_alpha: alphas.reduce((a, b) => a + b, 0) / alphas.length,
    median_alpha: median(alphas),
    hit_rate: alphas.filter((a) => a < 0).length / alphas.length,
  };
}
