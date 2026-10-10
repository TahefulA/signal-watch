export type EntityType = "company" | "risk" | "macro" | "financial" | "regulatory" | "neutral";

export type Severity = "high" | "medium" | "low" | "none";

export type SourceType = "10-K" | "10-Q" | "8-K" | "News";

/** Typed relationship from the entity to the subject company, aligned with FIBO relationship terms. */
export type RelationType =
  | "CUSTOMER_OF"
  | "SUPPLIES_TO"
  | "LENDS_TO"
  | "GUARANTEES"
  | "REGULATES"
  | "COMPETES_WITH"
  | "OWNED_BY"
  | "PARTNERS_WITH"
  | "IMPACTS";

export type Trend = "increasing" | "decreasing" | "stable" | "unknown";

export type MagnitudeKind = "revenue" | "cost" | "balance_sheet" | "contract" | "capacity" | "other";

/** A verbatim passage from a source document. */
export interface Citation {
  quote: string;
  sourceType: SourceType;
  sourceDate: string;
  sourceUrl: string;
  /** Section or publisher. */
  sourceLabel: string;
  /** Printed page number in the filing, when the filing has page footers. */
  page?: string | null;
}

/** A disclosed figure attached to an entity. Every number in the label appears in the citation. */
export interface Magnitude {
  kind: MagnitudeKind;
  /** Short display text, e.g. "$3,200.0 million principal". */
  label: string;
  citation: Citation;
}

export interface Strategic {
  /** Gemini's reading of the disclosures; never contains figures absent from the citations. */
  whyItMatters: string | null;
  ifItDisappeared: string | null;
  /** Contract, guarantee, collateral or similar, only when the filing describes one. */
  protection: { text: string; citation: Citation } | null;
}

export interface EntityChange {
  kind: "new" | "changed";
  details: string[];
}

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

  // Context fields. Undefined on reports generated before they existed; null when not disclosed.
  relationType?: RelationType;
  sourcePage?: string | null;
  /** The paragraph around the quote. */
  sourceContext?: string | null;
  magnitude?: Magnitude | null;
  trend?: Trend;
  trendCitation?: Citation | null;
  strategic?: Strategic;
  change?: EntityChange | null;
}

export const ENTITY_TYPES: EntityType[] = ["company", "risk", "macro", "financial", "regulatory", "neutral"];
export const SEVERITIES: Severity[] = ["high", "medium", "low", "none"];
export const RELATION_TYPES: RelationType[] = [
  "CUSTOMER_OF",
  "SUPPLIES_TO",
  "LENDS_TO",
  "GUARANTEES",
  "REGULATES",
  "COMPETES_WITH",
  "OWNED_BY",
  "PARTNERS_WITH",
  "IMPACTS",
];
export const TRENDS: Trend[] = ["increasing", "decreasing", "stable", "unknown"];
export const MAGNITUDE_KINDS: MagnitudeKind[] = ["revenue", "cost", "balance_sheet", "contract", "capacity", "other"];
