import type { Severity } from "./entity";

/** One periodic filing in the timeline, oldest first. */
export interface TimelineQuarter {
  /** "Q2 2026" or "FY 2025", from the filing's XBRL tags. */
  label: string;
  /** Balance sheet date, YYYY-MM-DD. */
  periodEnd: string;
  form: "10-K" | "10-Q";
  filed: string;
  url: string;
}

/**
 * When each entity on the current map is named in the company's periodic
 * filings. Built by searching each filing's text, the same way change detection
 * decides whether a name is new.
 */
export interface Timeline {
  /** Pipeline of this record; rebuilt when it changes. */
  version: number;
  builtAt: string;
  quarters: TimelineQuarter[];
  /** Entity id to one flag per quarter, aligned with quarters. */
  presence: Record<string, boolean[]>;
  /** Severity Gemini gave the same entity on the previous quarter's map, when that map exists. */
  severityBefore: Record<string, { quarter: string; severity: Severity }>;
}
