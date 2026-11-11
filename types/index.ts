export type * from "./entity";
export type * from "./graph";
export type * from "./memo";
export type * from "./capital";
export type * from "./changes";
export type * from "./brief";
export type * from "./dashboard";
export type * from "./timeline";
export type * from "./devils-advocate";
export type * from "./forecast";
export type * from "./committee";

import type { EntityGraph, MarketSnapshot, SourceDocument } from "./graph";
import type { Memo, MemoSpan } from "./memo";
import type { CapitalStructure } from "./capital";
import type { ChangeReport } from "./changes";
import type { MeetingBrief } from "./brief";
import type { Timeline } from "./timeline";
import type { DevilsAdvocate } from "./devils-advocate";
import type { DistressScore, FilingChange, RateStress } from "./forecast";
import type { CommitteeRecord } from "./committee";
import type { LmeScan } from "./lme";
import type { SponsorContext } from "./contagion";

/** What citation validation and entity resolution did to Gemini's proposals. */
export interface Validation {
  proposed: number;
  kept: number;
  rejected: { name: string; reason: string; quote: string }[];
  merges: { kept: string; merged: string; reason: string }[];
  /** Boxes added from the verified debt note, outside Gemini's entity proposals. */
  debtAdded?: number;
  /** True when the first extraction kept too few entities and a second one was used. */
  retried?: boolean;
}

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
  /** Version of the extraction pipeline that built the report. */
  pipelineVersion?: number;
  market: MarketSnapshot | null;
  sources: SourceDocument[];
  filingsAnalyzed: number;
  newsAnalyzed: number;
  /** Shown above the map, e.g. when few entities were found. */
  notes: string[];
  validation?: Validation;
  /** Three or four sentences above the map; entity names link to their boxes. */
  signal?: MemoSpan[] | null;
  /** Which quarters each entity is named in, built on first request. */
  timeline?: Timeline | null;
  /** The counter-argument to the memo, once requested. */
  devil?: DevilsAdvocate | null;
  /** Twelve-month bankruptcy probability, scored when the report is built. */
  distress?: DistressScore | null;
  /** How much the newest 10-K or 10-Q rewrote each section against the prior one. */
  filingChange?: FilingChange | null;
  /** Kalshi's Fed rate path applied to the floating-rate debt and the cash forecast. */
  rateStress?: RateStress | null;
  /** The last committee debate, once run. */
  committee?: CommitteeRecord | null;
  /** The credit documents read for liability-management trapdoors, once scanned. */
  lme?: LmeScan | null;
  /** The sponsor contagion graph's view of this borrower, when it is a sponsor-backed SEC filer. */
  sponsor?: SponsorContext | null;
}

export type AnalyzeEvent =
  | { type: "step"; step: string }
  | { type: "result"; report: Report; cached: boolean }
  | { type: "error"; message: string };

/** An answer to a natural-language question, drawn only from one report. */
export interface AskAnswer {
  question: string;
  /** Entity mentions link to their boxes; "capital" links to the capital structure. */
  spans: MemoSpan[];
  /** Entities whose quotes support the answer, shown as clickable chips. */
  citedIds: string[];
  notFound: boolean;
  /** Sentences removed because they used a figure not in the report. */
  removed: number;
}
export type * from "./lme";
export type * from "./contagion";
