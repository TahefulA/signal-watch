import type { Citation } from "./entity";
import type { MemoSpan } from "./memo";
import type { PeerMetricRow } from "./peers";

export interface BriefSource {
  label: string;
  url: string;
}

/** One line of the brief, with the quotes and filings behind it. */
export interface BriefItem {
  spans: MemoSpan[];
  /** Why this matters, or for a question, the gap it comes from. */
  basis?: string;
  citations: Citation[];
  sources: BriefSource[];
}

export interface BriefRisk {
  entityId: string;
  name: string;
  severity: string;
  citation: Citation;
}

export interface MeetingBrief {
  reportId: string;
  generatedAt: string;
  mustKnow: BriefItem[];
  numbers: { label: string; display: string; note?: string }[];
  questions: BriefItem[];
  risks: BriefRisk[];
  comparables: { tickers: string[]; rows: PeerMetricRow[] } | null;
}
