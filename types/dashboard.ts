import type { SourceDocument } from "./graph";
import type { MemoStance } from "./devils-advocate";

/**
 * Where a watched company sits in the morning queue. Decided by written rules
 * (lib/dashboard.ts), each with its reason shown; never a numeric score.
 */
export type WatchStatus = "act" | "review" | "quiet" | "unanalyzed";

/** One reason a company is in the queue, with its date and source when it has one. */
export interface WatchReason {
  tone: "act" | "review";
  text: string;
  date?: string | null;
  url?: string | null;
}

/** A "What to watch" item from the company's Devil's Advocate case, tracked on the watchlist. */
export interface WatchItemStatus {
  item: string;
  when: string;
  signal: string;
  /** "due" once a filing that can settle it has arrived, or its date has passed. */
  status: "pending" | "due";
}

/** One event in the activity feed across the watchlist. */
export interface FeedEvent {
  ticker: string;
  date: string;
  kind: "filing" | "8-K" | "insider" | "maturity";
  text: string;
  url?: string | null;
  tone: "act" | "review" | "info";
}

export interface WatchCard {
  ticker: string;
  name: string | null;
  reportId: string | null;
  generatedAt: string | null;
  status: WatchStatus;
  reasons: WatchReason[];
  /** "Q2 2026" and the filing the report is based on. */
  quarter: string | null;
  basedOn: string | null;
  memoStance: MemoStance | null;
  strongPoints: number;
  moderatePoints: number;
  entityCount: number;
  highSeverity: string[];
  totalDebt: string | null;
  liquidity: string | null;
  ebitda: string | null;
  return90d: number | null;
  benchmarkReturn90d: number | null;
  /** Quarter-end cash from XBRL, oldest first, for the trend bars. */
  cash: { end: string; value: number }[];
  /** Latest quarter's free cash flow, when tagged. */
  lastFcf: number | null;
  /** Quarters of the latest burn rate that cash covers, when free cash flow is negative. */
  runwayQuarters: number | null;
  nextMaturity: { date: string; text: string } | null;
  /** 10-K, 10-Q and 8-K filings on EDGAR newer than the ones the report read. */
  newFilings: (SourceDocument & { items?: string; meaning?: string })[];
  watchItems: WatchItemStatus[];
  /** Counts from the last comparison with the previous quarter, if one was run. */
  changeCounts: { new: number; changed: number; removed: number } | null;
}

export interface WatchlistResponse {
  cards: WatchCard[];
  feed: FeedEvent[];
  checkedAt: string;
}
