export type * from "./entity";
export type * from "./graph";
export type * from "./memo";

import type { EntityGraph, MarketSnapshot, SourceDocument } from "./graph";
import type { Memo } from "./memo";

export interface Report {
  id: string;
  generatedAt: string;
  graph: EntityGraph;
  memo: Memo;
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
