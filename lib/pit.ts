import type { FactBook } from "./xbrl";

/**
 * Point in time. Every backtest number goes through these filters, so a model
 * scoring a company on a date sees only what had been filed before that date:
 * no later 10-K, no restatement filed afterwards, no filing made that same day.
 */

/** The facts filed strictly before a date. A restatement filed later is invisible, so the first-reported figure is used. */
export function bookAsOf(book: FactBook, asOf: string): FactBook {
  const out: FactBook = new Map();
  for (const [concept, facts] of book) {
    const known = facts.filter((f) => f.filed < asOf);
    if (known.length) out.set(concept, known);
  }
  return out;
}

/** Filings made strictly before a date, newest first as EDGAR lists them. */
export function filingsAsOf<T extends { filingDate: string }>(filings: T[], asOf: string): T[] {
  return filings.filter((f) => f.filingDate < asOf);
}

/** One input to a score, with the date it became public; the leakage audit checks filed < asOf for each. */
export interface DatedInput {
  label: string;
  value: number;
  /** Period end the figure describes. */
  periodEnd: string;
  /** Date the filing that reported it was made. */
  filed: string;
  url: string;
}

/** True when every input was public before the scoring date. */
export function noLeak(inputs: DatedInput[], asOf: string): boolean {
  return inputs.every((i) => i.filed < asOf);
}
