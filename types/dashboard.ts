import type { SourceDocument } from "./graph";

export interface WatchCard {
  ticker: string;
  name: string | null;
  reportId: string | null;
  generatedAt: string | null;
  entityCount: number;
  highSeverity: string[];
  totalDebt: string | null;
  liquidity: string | null;
  ebitda: string | null;
  return90d: number | null;
  /** 10-K, 10-Q and 8-K filings on EDGAR newer than the ones the report read. */
  newFilings: SourceDocument[];
  /** Counts from the last comparison with the previous quarter, if one was run. */
  changeCounts: { new: number; changed: number; removed: number } | null;
}
