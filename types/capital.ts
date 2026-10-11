import type { Citation } from "./entity";

export type DebtKind = "revolver" | "term_loan" | "secured_notes" | "unsecured_notes" | "convertible_notes" | "other";

export type Seniority = "senior_secured" | "senior_unsecured" | "subordinated" | "other";

export interface DebtInstrument {
  id: string;
  name: string;
  kind: DebtKind;
  seniority: Seniority;
  /** Outstanding principal in dollars, parsed from the filing's own text. */
  outstanding: number | null;
  outstandingText: string | null;
  /** Total commitment for revolvers and delayed-draw facilities. */
  commitment: number | null;
  commitmentText: string | null;
  /** YYYY-MM-DD or YYYY, as disclosed. */
  maturity: string | null;
  coupon: string | null;
  /** Issuance, amendment, repayment or refinancing in the twelve months before the filing. */
  recentChange: string | null;
  citations: Citation[];
  /** Parent company or subsidiary debt, when the footnote separates them. */
  issuer?: "parent" | "subsidiary" | null;
  /** A category row ("Parent company senior debt, fixed rate") rather than one named instrument. */
  aggregate?: boolean;
  /** Fields filled from the filing's inline XBRL rather than its text. */
  xbrlFields?: ("coupon" | "maturity" | "outstanding")[];
}

export interface XbrlValue {
  /** us-gaap concept name. */
  concept: string;
  value: number;
  /** "As of 2026-06-30" or "12 months ended 2026-06-30". */
  period: string;
  form: string;
  filed: string;
  url: string;
}

export interface CapitalMetric {
  key:
    | "revenue"
    | "ebitda_margin"
    | "cash"
    | "current_ratio"
    | "fcf"
    | "next_maturity"
    | "revolver_availability"
    | "total_debt"
    | "net_debt"
    | "ebitda"
    | "debt_to_ebitda" | "net_debt_to_ebitda" | "interest_coverage" | "secured_share" | "liquidity";
  label: string;
  /** Display text, e.g. "4.2x", "n/m" or "$2.62 billion". */
  display: string;
  /** How the number was built and why it may not be meaningful. */
  note: string;
  inputs: XbrlValue[];
}

export interface MaturityRow {
  /** "Remainder of 2026", "2027" or "Thereafter". */
  period: string;
  /** Dollars. */
  amount: number;
}

/** Principal maturities table from the debt note, read directly from the filing. */
export interface MaturitySchedule {
  rows: MaturityRow[];
  total: number;
  /** The table as it appears in the filing text. */
  table: string;
  citation: Citation;
  /** Where the rows came from: the note's table, sentences in the note, or tagged XBRL facts. */
  source?: "table" | "text" | "xbrl";
  /** As of date of the schedule, when it differs from the capital structure's. */
  asOf?: string | null;
}

export interface CapitalStructure {
  /** Balance sheet date of the filing the debt note came from. */
  asOf: string | null;
  sourceType: "10-K" | "10-Q";
  sourceDate: string;
  sourceUrl: string;
  /** "Q2 2026" for the periodic filing the debt note came from. */
  fiscalPeriod?: string | null;
  instruments: DebtInstrument[];
  maturitySchedule: MaturitySchedule | null;
  metrics: CapitalMetric[];
  /** Twelve-month figures from XBRL used in the ratios. */
  financials: XbrlValue[];
  /** "aggregate" when the footnote reports debt only by category, not by instrument. */
  disclosure?: "instrument" | "aggregate";
  /** Set when the newest periodic filing has no debt note and an earlier one was read. */
  noteFallback?: string | null;
}
