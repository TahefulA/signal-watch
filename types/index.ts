export type * from "./entity";
export type * from "./graph";
export type * from "./memo";
export type * from "./capital";
export type * from "./changes";
export type * from "./peers";
export type * from "./brief";
export type * from "./dashboard";

import type { EntityGraph, MarketSnapshot, SourceDocument } from "./graph";
import type { Memo } from "./memo";
import type { CapitalStructure } from "./capital";
import type { ChangeReport } from "./changes";
import type { MeetingBrief } from "./brief";

export interface Report {
  id: string;
  generatedAt: string;
  graph: EntityGraph;
  memo: Memo;
  /** Missing on reports generated before the capital structure panel existed. */
  capital?: CapitalStructure | null;
  /** One-page meeting brief, once requested. */
  brief?: MeetingBrief | null;
  /** Comparison with the previous quarter's filings, once requested. */
  changes?: ChangeReport | null;
  /** Set on baseline reports built from filings available on this date; they are never served as current. */
  asOf?: string | null;
  market: MarketSnapshot | null;
  sources: SourceDocument[];
  filingsAnalyzed: number;
  newsAnalyzed: number;
  /** Shown above the map, e.g. when few entities were found. */
  notes: string[];
}

export type AnalyzeEvent =
  | { type: "step"; step: string }
  | { type: "result"; report: Report; cached: boolean }
  | { type: "error"; message: string };
