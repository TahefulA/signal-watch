import type { MemoSpan } from "./memo";

export type PatternCategory = "financial" | "customer" | "debt" | "operational" | "industry";

/**
 * fired: the trigger condition holds on the data read.
 * clear: the data needed was read and the trigger does not hold.
 * not_evaluated: the data the check needs is not in the filings or feeds Signal Watch reads.
 */
export type PatternStatus = "fired" | "clear" | "not_evaluated";

/** Where a pattern's numbers or wording came from. */
export interface PatternEvidence {
  /** "10-Q Q2 2026", "XBRL: AccountsReceivableNetCurrent", "Form 4 filed 2026-09-14". */
  label: string;
  url: string;
  /** Verbatim sentence from the filing, when the evidence is text. */
  quote?: string;
}

export interface PatternResult {
  id: string;
  name: string;
  category: PatternCategory;
  status: PatternStatus;
  /** The filled template when fired; otherwise what was checked, or what is missing. */
  detail: string;
  evidence: PatternEvidence[];
}

/** One claim in the counter-argument, pointing at an entity box, a pattern or the capital structure. */
export interface CounterCitation {
  claim: string;
  /** "10-Q Q2 2026", built from the entity or pattern evidence, never written by the model. */
  source: string;
  url: string | null;
  quote: string | null;
  entityId: string | null;
  patternId: string | null;
}

export interface DevilsAdvocate {
  reportId: string;
  generatedAt: string;
  /** The counter-argument; entity names link to their boxes. */
  argument: MemoSpan[];
  citations: CounterCitation[];
  /** Names of the patterns that fired and that the argument used. */
  patternsUsed: string[];
  whatToWatch: string;
  /** Every pattern's result, so the panel can show what was checked. */
  patterns: PatternResult[];
  /** Sentences removed because they used a figure not in the facts. */
  removed: number;
}
