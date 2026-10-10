export type EntityType = "company" | "risk" | "macro" | "financial" | "regulatory" | "neutral";

export type Severity = "high" | "medium" | "low" | "none";

export type SourceType = "10-K" | "10-Q" | "8-K" | "News";

/** One box on the map. Every entity carries the quote that proves it exists. */
export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  /** How the entity relates to the subject company, 2-5 words. */
  relationship: string;
  severity: Severity;
  sourceType: SourceType;
  /** ISO date, YYYY-MM-DD */
  sourceDate: string;
  /** Verbatim text from the source document. */
  sourceQuote: string;
  sourceUrl: string;
  /** Section or publisher, e.g. "Item 1A. Risk Factors" or "Reuters". */
  sourceLabel: string;
  isCentral?: boolean;
}

export const ENTITY_TYPES: EntityType[] = ["company", "risk", "macro", "financial", "regulatory", "neutral"];
export const SEVERITIES: Severity[] = ["high", "medium", "low", "none"];
