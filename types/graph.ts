import type { Entity } from "./entity";

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
  sectorEtf: string | null;
  sectorReturn90d: number | null;
}

export interface SourceDocument {
  id: string;
  sourceType: "10-K" | "10-Q" | "8-K" | "News";
  title: string;
  date: string;
  url: string;
}
