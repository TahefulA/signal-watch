import type { Citation, SourceDocument } from "./index";

export type ChangeKind = "new" | "removed" | "magnitude" | "severity" | "relationship" | "new_debt" | "repaid_debt" | "debt_amount";

export interface EntityDiff {
  kind: ChangeKind;
  /** Entity id on the current map; absent for removed entities and debt changes. */
  entityId?: string;
  name: string;
  /** True for changes in Gemini's ratings rather than in the filings' facts. */
  judgment?: boolean;
  /** One sentence describing the change. */
  detail: string;
  before?: string;
  after?: string;
  /** Before and after evidence, oldest first. */
  citations: Citation[];
}

/** What changed between the filings behind a baseline report and the current one. */
export interface ChangeReport {
  baselineId: string;
  /** The baseline reads filings filed on or before this date. */
  baselineAsOf: string;
  baselineFilings: SourceDocument[];
  /** Filings read now that the baseline did not read. */
  newFilings: SourceDocument[];
  changes: EntityDiff[];
  /** Entities extracted only this time whose names already appear in the baseline filings. Not flagged as new. */
  mentionedBefore: string[];
  comparedAt: string;
}
