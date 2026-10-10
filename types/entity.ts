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
  | "AFFILIATED_WITH"
  | "IMPACTS";

/**
 * The specific relationship, from an expanded taxonomy. Qualified labels such as
 * SOLE_SUPPLIER_OF are kept only when the entity's quote uses a supporting word.
 */
export type RelationDetail =
  | "SOLE_SUPPLIER_OF"
  | "PRIMARY_SUPPLIER_OF"
  | "SECONDARY_SUPPLIER_OF"
  | "SUPPLIES_TO"
  | "ANCHOR_TENANT_OF"
  | "MAJOR_CUSTOMER_OF"
  | "CUSTOMER_OF"
  | "TRIAL_CUSTOMER_OF"
  | "GUARANTEES"
  | "PROVIDES_CREDIT_SUPPORT_TO"
  | "LENDS_TO"
  | "HAS_CREDIT_FACILITY_WITH"
  | "DIRECT_COMPETITOR_OF"
  | "INDIRECT_COMPETITOR_OF"
  | "COMPETES_WITH"
  | "REGULATED_BY"
  | "SUBJECT_TO_ORDER_FROM"
  | "LICENSED_BY"
  | "MONITORED_BY"
  | "OWNS"
  | "JOINT_VENTURE_WITH"
  | "PARTNERS_WITH"
  | "EXECUTIVE_OF"
  | "DIRECTOR_OF"
  | "MAJOR_HOLDER_OF"
  | "EXPOSED_TO"
  | "DEPENDENT_ON"
  | "VULNERABLE_TO"
  | "IMPACTED_BY"
  | "SENSITIVE_TO"
  | "DRIVEN_BY";

export type Confidence = "high" | "medium" | "low";

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
  /** removed entities are drawn faded from the baseline report. */
  kind: "new" | "changed" | "removed";
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
  relationDetail?: RelationDetail;
  /** One line for the box, no figures beyond those in the entity's quotes. */
  headline?: string | null;
  /** "Q2 2026" or "FY 2025" for filings, from the filing's XBRL data. */
  fiscalPeriod?: string | null;
  confidence?: Confidence;
  /** Why the confidence label was given, e.g. "Named in a 10-Q sentence". */
  confidenceBasis?: string;
  /** Parent or controlling entity, only when a filing sentence states it. */
  parent?: { name: string; citation: Citation } | null;
  /** Other names merged into this entity by entity resolution. */
  aliases?: string[];
  /** Evidence for a trend found by comparing with the previous quarter. */
  trendBasis?: string | null;
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
  "AFFILIATED_WITH",
  "IMPACTS",
];

/** Each specific relationship and the general one it belongs to. */
export const RELATION_DETAILS: Record<RelationDetail, RelationType> = {
  SOLE_SUPPLIER_OF: "SUPPLIES_TO",
  PRIMARY_SUPPLIER_OF: "SUPPLIES_TO",
  SECONDARY_SUPPLIER_OF: "SUPPLIES_TO",
  SUPPLIES_TO: "SUPPLIES_TO",
  ANCHOR_TENANT_OF: "CUSTOMER_OF",
  MAJOR_CUSTOMER_OF: "CUSTOMER_OF",
  CUSTOMER_OF: "CUSTOMER_OF",
  TRIAL_CUSTOMER_OF: "CUSTOMER_OF",
  GUARANTEES: "GUARANTEES",
  PROVIDES_CREDIT_SUPPORT_TO: "GUARANTEES",
  LENDS_TO: "LENDS_TO",
  HAS_CREDIT_FACILITY_WITH: "LENDS_TO",
  DIRECT_COMPETITOR_OF: "COMPETES_WITH",
  INDIRECT_COMPETITOR_OF: "COMPETES_WITH",
  COMPETES_WITH: "COMPETES_WITH",
  REGULATED_BY: "REGULATES",
  SUBJECT_TO_ORDER_FROM: "REGULATES",
  LICENSED_BY: "REGULATES",
  MONITORED_BY: "REGULATES",
  OWNS: "OWNED_BY",
  JOINT_VENTURE_WITH: "PARTNERS_WITH",
  PARTNERS_WITH: "PARTNERS_WITH",
  EXECUTIVE_OF: "AFFILIATED_WITH",
  DIRECTOR_OF: "AFFILIATED_WITH",
  MAJOR_HOLDER_OF: "AFFILIATED_WITH",
  EXPOSED_TO: "IMPACTS",
  DEPENDENT_ON: "IMPACTS",
  VULNERABLE_TO: "IMPACTS",
  IMPACTED_BY: "IMPACTS",
  SENSITIVE_TO: "IMPACTS",
  DRIVEN_BY: "IMPACTS",
};
export const TRENDS: Trend[] = ["increasing", "decreasing", "stable", "unknown"];
export const MAGNITUDE_KINDS: MagnitudeKind[] = ["revenue", "cost", "balance_sheet", "contract", "capacity", "other"];
