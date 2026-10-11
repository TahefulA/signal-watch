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

/** The stance the memo itself takes, as Gemini classifies it. A category, never a score. */
export type MemoStance = "STABLE" | "CAUTION" | "AT_RISK" | "DISTRESSED";

export const MEMO_STANCES: MemoStance[] = ["STABLE", "CAUTION", "AT_RISK", "DISTRESSED"];

export interface DevilsAdvocate {
  reportId: string;
  generatedAt: string;
  /** The counter-argument; entity names link to their boxes. */
  argument: MemoSpan[];
  citations: CounterCitation[];
  /** Names of the patterns that fired and that the argument used. */
  patternsUsed: string[];
  whatToWatch: string;
  /** Missing on counter-arguments written before the stance was classified. */
  memoStance?: MemoStance | null;
  /** Every pattern's result, so the panel can show what was checked. */
  patterns: PatternResult[];
  /** Sentences removed because they used a figure not in the facts. */
  removed: number;
  /** The long, structured case. Missing on counter-arguments written before it existed. */
  period?: CasePeriod | null;
  /** What a reader with no context needs first: the company, the period, what the memo says and what this case does. */
  primer?: string;
  /** The case in one paragraph; also stored in argument for the badge and the map. */
  bottomLine?: MemoSpan[];
  sections?: CaseSection[];
  /** The strongest answer to the case, so the reader can weigh both sides. */
  rebuttal?: string;
  watchList?: WatchItem[];
  /** Dated events behind the case, oldest first. */
  events?: CaseEvent[];
  /** Terms used in the case, explained. */
  glossary?: GlossaryTerm[];
  /** What was read, and what could not be. */
  coverage?: CoverageItem[];
}

/** The reporting period the case is about and how old its information is. */
export interface CasePeriod {
  /** "Q2 2026". */
  quarter: string | null;
  /** Balance sheet date of the latest periodic filing. */
  periodEnd: string | null;
  form: string | null;
  filed: string | null;
  url: string | null;
  /** Days from the filing to the day the case was written. */
  daysSinceFiling: number | null;
  /** Day the case was written. */
  writtenOn: string;
  /** Quarters of XBRL history the trend tables cover, e.g. "Q3 2023 to Q2 2026". */
  historySpan: string | null;
}

export type CaseTheme = "earnings" | "liquidity" | "debt" | "counterparties" | "changes" | "behavior" | "peers" | "market";

export const CASE_THEMES: CaseTheme[] = ["earnings", "liquidity", "debt", "counterparties", "changes", "behavior", "peers", "market"];

/** A table of figures built from the data, never written by the model. */
export interface Exhibit {
  title: string;
  columns: string[];
  rows: string[][];
  note?: string;
  source?: { label: string; url: string } | null;
}

/** How much weight the point carries, as the model judges it. A category, never a score. */
export type CaseStrength = "strong" | "moderate" | "weak";

export interface CaseSection {
  theme: CaseTheme;
  /** Fixed name of the theme, e.g. "Revenue and earnings quality". */
  themeLabel: string;
  /** The point, stated as a claim. */
  headline: string;
  /** What the memo says that this section challenges, or that the memo is silent on it. */
  memoSays: string;
  /** The detailed argument; entity names link to their boxes. */
  argument: MemoSpan[];
  /** The same point for a reader who does not know credit terms. */
  plainEnglish: string;
  /** Why a lender should care. */
  whyItMatters: string;
  strength: CaseStrength;
  citations: CounterCitation[];
  exhibits: Exhibit[];
}

export interface WatchItem {
  item: string;
  /** When it will be known, e.g. "Q3 2026 10-Q". */
  when: string;
  /** What would confirm the case and what would weaken it. */
  signal: string;
}

export interface CaseEvent {
  date: string;
  /** "Q2 2026" when the event is a periodic filing or a quarter end. */
  quarter?: string | null;
  kind: "filing" | "8-K" | "insider" | "maturity" | "entity" | "market";
  text: string;
  url?: string | null;
}

export interface GlossaryTerm {
  term: string;
  meaning: string;
}

export interface CoverageItem {
  label: string;
  detail: string;
  read: boolean;
}
