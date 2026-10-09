export type ComponentKey =
  | "filing_anomaly"
  | "insider_activity"
  | "sentiment_divergence"
  | "market_divergence";

export interface ComponentScores {
  filing_anomaly: number;
  insider_activity: number;
  sentiment_divergence: number;
  market_divergence: number;
}

/** One daily risk score. Higher means more concern. */
export interface SignalScore extends ComponentScores {
  ticker: string;
  /** ISO date, YYYY-MM-DD */
  date: string;
  total_score: number;
  /** Event ids that contributed to each component on this date. */
  drivers: Record<ComponentKey, string[]>;
  /** One-line explanation of each component value on this date. */
  notes: Record<ComponentKey, string>;
}

export interface ComponentDefinition {
  key: ComponentKey;
  label: string;
  weight: number;
  description: string;
}

export interface TickerProfile {
  ticker: string;
  name: string;
  cik: string;
  sector: string;
  sector_etf: string;
}

export interface TickerSummary {
  ticker: string;
  name: string;
  latest_score: number;
  change_7d: number;
  reason: string;
  sparkline: number[];
}

export interface BacktestThresholdResult {
  threshold: number;
  /** Entry signals: the first day a ticker crosses the threshold after being below it. */
  signals: number;
  /** Mean of stock return minus sector ETF return over the horizon. */
  average_alpha: number | null;
  median_alpha: number | null;
  /** Share of signals where the stock underperformed its sector, the outcome a risk flag predicts. */
  hit_rate: number | null;
}

export interface BacktestReport {
  generated_at: string;
  window_start: string;
  window_end: string;
  horizon_days: number;
  tickers: string[];
  ticker_days: number;
  thresholds: BacktestThresholdResult[];
}
