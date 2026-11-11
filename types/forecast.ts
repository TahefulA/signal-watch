/** One tagged figure behind a score, with the day it became public. */
export interface DatedInputView {
  label: string;
  value: number;
  periodEnd: string;
  filed: string;
  url: string;
}

export interface DistressReason {
  feature: string;
  label: string;
  value: number | null;
  /** The value as shown, e.g. "-0.42" or "3.1 months". */
  display: string;
  /** Change in log-odds credited to this feature along the trees: positive raises the probability. */
  contribution: number;
}

export type DistressBand = "low" | "elevated" | "high" | "severe";

/** Twelve-month probability of a bankruptcy filing, from the boosted trees in model/distress.json. */
export interface DistressScore {
  probability: number;
  band: DistressBand;
  /** Altman Z'' on the same figures: the published baseline. */
  zScore: number | null;
  zZone: "distress" | "grey" | "safe" | null;
  /** Largest contributions toward distress, then the largest against it. */
  reasons: DistressReason[];
  offsets: DistressReason[];
  /** Scoring date and balance sheet date. */
  asOf: string;
  periodEnd: string;
  modelVersion: string;
  /** Last observation the model was trained on. */
  trainedThrough: string;
  /** Average yearly bankruptcy rate in the training universe, for scale. */
  baseRate: number;
  inputs: DatedInputView[];
  /** Every input was filed before asOf. */
  leakFree: boolean;
}

export interface SectionChange {
  section: string;
  /** Cosine similarity of word counts against the prior filing's same section, 0 to 1. */
  similarity: number;
  /** Sentences new in this filing, and sentences the prior filing had that this one dropped. */
  added: string[];
  removed: string[];
  wordsNow: number;
  wordsBefore: number;
}

/** "Lazy Prices": how much the newest 10-K or 10-Q rewrote each section against the same form a period earlier. */
export interface FilingChange {
  current: { form: string; filed: string; url: string };
  prior: { form: string; filed: string; url: string };
  /** Word-weighted similarity across the sections compared. */
  overall: number;
  sections: SectionChange[];
  /** True when the risk factor, legal or debt sections changed more than usual. */
  flagged: boolean;
  /** The threshold used, from the filings of the companies in the training sample. */
  threshold: number;
}

export interface RateScenario {
  key: "hold" | "market" | "stress";
  label: string;
  how: string;
  upper: number;
  deltaPoints: number;
  /** Extra interest per year on floating debt, in dollars. */
  extraInterest: number;
  quarterlyFcf: number | null;
  runsOutAt: string | null;
  endingCash: number | null;
  quarters: number | null;
  startCash: number | null;
  startEnd: string | null;
}

export interface RateStress {
  floatingDebt: number;
  totalDebt: number;
  floatingShare: number | null;
  currentUpper: number | null;
  currentAsOf: string | null;
  meeting: {
    event: string;
    date: string;
    expectedUpper: number;
    stressUpper: number;
    pHike: number;
    pCut: number;
    url: string;
    widestGap: number;
  } | null;
  fetchedAt: string;
  scenarios: RateScenario[];
  note: string | null;
  /** What the what-if panel needs to rerun the cash forecast in the browser. */
  inputs?: ScenarioInputs | null;
}

/** The filed figures behind the cash forecast, so a reader can change one assumption and rerun it. */
export interface ScenarioInputs {
  fcf: { end: string; value: number }[];
  cash: { end: string; value: number }[];
  schedule: { period: string; amount: number }[] | null;
  /** Undrawn revolver commitments from the debt note (an upper bound when the drawn amount is not disclosed). */
  undrawn: number;
  floatingDebt: number;
  currentUpper: number | null;
  expectedUpper: number | null;
  stressUpper: number | null;
  meetingDate: string | null;
}
