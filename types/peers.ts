import type { Citation, RelationType } from "./entity";

export interface PeerCompany {
  reportId: string;
  ticker: string;
  name: string;
}

export interface PeerMember {
  ticker: string;
  /** Empty when the entity is named in this company's filings but not on its map. */
  entityId: string;
  /** False when found by searching this company's filing text rather than on its map. */
  mapped: boolean;
  name: string;
  relationship: string;
  relationType?: RelationType;
  citation: Citation;
}

/** An entity, or a risk theme, that appears on more than one company's map. */
export interface SharedEntity {
  /** "named" for the same counterparty or regulator; "theme" for similar risk disclosures. */
  kind: "named" | "theme";
  label: string;
  members: PeerMember[];
}

export interface PeerMetricRow {
  label: string;
  values: { ticker: string; display: string; note?: string }[];
}

export interface Divergence {
  text: string;
  tickers: string[];
}

export interface PeerComparison {
  id: string;
  /** The subject company first. */
  companies: PeerCompany[];
  shared: SharedEntity[];
  /** Entity ids found on only one company's map, by ticker. */
  unique: Record<string, string[]>;
  metrics: PeerMetricRow[];
  divergences: Divergence[];
  createdAt: string;
}
