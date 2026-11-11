import type { DistressBand } from "./forecast";
import type { Trapdoor, TrapdoorRisk } from "./lme";

/** A private equity firm, under one canonical name. */
export interface Sponsor {
  id: string;
  name: string;
  aliases: string[];
}

/** Why a company is tied to a sponsor: the sponsor definition in its own credit agreement or indenture. */
export interface SponsorLink {
  sponsorId: string;
  /** The definition as filed, e.g. "Sponsor" means Leonard Green & Partners, L.P. ... */
  quote: string;
  documentUrl: string;
  filed: string;
}

export type LmeEventKind = "bankruptcy" | "restructuring" | "lme";

/** A liability management exercise, restructuring or bankruptcy, from the company's own 8-K. */
export interface LmeEvent {
  id: string;
  cik: string;
  date: string;
  kind: LmeEventKind;
  /** The term that found it: "Item 1.03", "transaction support agreement", "uptier". */
  term: string;
  /** A sentence from the filing, found in it word for word. */
  quote: string;
  url: string;
}

export interface ContagionCompany {
  cik: string;
  name: string;
  ticker: string | null;
  sponsors: SponsorLink[];
  /** Latest 10-K or 10-Q; companies taken private or liquidated stop filing. */
  lastPeriodic: string | null;
  active: boolean;
  distress: { probability: number; band: DistressBand; periodEnd: string } | null;
  /** Total debt on the latest balance sheet, from XBRL. */
  debt: { value: number; asOf: string; url: string } | null;
  /** Principal due in the 12 months after the balance sheet date, and in the 12 after that, from the debt note's XBRL. */
  due: { next12: number | null; year2: number | null; asOf: string; url: string } | null;
  /** The administrative agent on the credit agreement's cover. */
  agent: { name: string; quote: string; url: string } | null;
  /** The trapdoor check on the company's credit documents; undefined when not run. */
  lme?: {
    verdicts: { trapdoor: Trapdoor; risk: TrapdoorRisk }[];
    open: { trapdoor: Trapdoor; section: string | null; quote: string; url: string }[];
    documents: number;
    scannedAt: string;
  } | null;
  events: LmeEvent[];
}

export interface ContagionEdge {
  id: string;
  kind: "sponsor" | "lender";
  /** Sponsor id or company CIK. */
  source: string;
  target: string;
  label: string;
}

export type ContagionFlag = "target" | "watch" | "clear" | "history";

export type ContagionRuleKey = "sponsor_history" | "trapdoor_open" | "maturity" | "distress";

export interface ContagionRule {
  key: ContagionRuleKey;
  fired: boolean;
  text: string;
  url?: string;
}

/** What the graph search found for one company, and which rules fired. */
export interface ContagionAssessment {
  cik: string;
  flag: ContagionFlag;
  rules: ContagionRule[];
  /** The nearest earlier event in the graph, and how it connects. */
  trigger: { cik: string; name: string; event: LmeEvent; path: string[]; degrees: number } | null;
  /** Other events reachable within two steps. */
  reachable: { cik: string; eventId: string; degrees: number }[];
  /** The window the maturity rule points at: the end of the period with debt due. */
  window: string | null;
  /** Three sentences for the PM, each checked against the graph data. */
  warning?: ContagionWarning | null;
}

export interface ContagionWarning {
  sentences: { text: string; cites: string[]; verified: boolean; reason?: string }[];
  struck: number;
}

export interface ContagionMap {
  builtAt: string;
  sponsors: (Sponsor & { companies: number; events: number })[];
  companies: ContagionCompany[];
  edges: ContagionEdge[];
  assessments: ContagionAssessment[];
  note: string;
}

/** The sponsor graph's view of one borrower, saved on its report. */
export interface SponsorContext {
  sponsors: string[];
  definition: string;
  documentUrl: string;
  flag: ContagionFlag;
  /** The text of each rule that fired. */
  fired: string[];
  siblings: number;
  /** The nearest event at a sibling under the same sponsor. */
  trigger: { name: string; date: string; kind: LmeEventKind; term: string; quote: string; url: string } | null;
  builtAt: string;
}
