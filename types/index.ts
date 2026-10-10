export type * from "./entity";
export type * from "./graph";
export type * from "./memo";
export type * from "./capital";

import type { EntityGraph, MarketSnapshot, SourceDocument } from "./graph";
import type { Memo } from "./memo";
import type { CapitalStructure } from "./capital";

export interface Report {
  id: string;
  generatedAt: string;
  graph: EntityGraph;
  memo: Memo;
  /** Missing on reports generated before the capital structure panel existed. */
  capital?: CapitalStructure | null;
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
