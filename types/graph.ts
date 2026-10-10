import type { Citation, Entity } from "./entity";

export interface EntityEdge {
  id: string;
  source: string;
  target: string;
  relationship: string;
}

export interface CompanyProfile {
  ticker: string;
  name: string;
  cik: string;
  /** SEC standard industrial classification, e.g. "Finance Services". */
  sic?: string | null;
  /** How the company describes itself, a verbatim phrase from its business description. */
  industry?: string | null;
  /** Ratings only when a filing or headline states them, with the sentence. */
  ratings?: CreditRating[];
}

export interface CreditRating {
  agency: string;
  rating: string;
  outlook: string | null;
  /** What was rated, e.g. "corporate family" or "2030 Secured Notes". */
  subject: string | null;
  citation: Citation;
}

export interface EntityGraph {
  company: CompanyProfile;
  nodes: Entity[];
  edges: EntityEdge[];
}

export interface MarketSnapshot {
  /** Last close, in dollars. */
  price: number;
  priceDate: string;
  return90d: number;
  high52w: number;
  low52w: number;
  marketCap: number | null;
  averageVolume90d: number;
  benchmark: string | null;
  benchmarkReturn90d: number | null;
}

export interface SourceDocument {
  id: string;
  sourceType: "10-K" | "10-Q" | "8-K" | "News";
  title: string;
  date: string;
  url: string;
  /** "Q2 2026" for periodic filings. */
  fiscalPeriod?: string | null;
}
