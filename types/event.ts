import type { ComponentKey } from "./signal";

/** Verbatim text, or a restatement of reported figures. */
export type QuoteKind = "verbatim" | "reported";

export type EventType = "filing" | "news" | "insider" | "market";

/** Display category on the timeline, finer than EventType. */
export type EventCategory =
  | "filing"
  | "news_positive"
  | "news_negative"
  | "insider"
  | "market";

export interface SignalEvent {
  id: string;
  ticker: string;
  /** ISO date, YYYY-MM-DD */
  date: string;
  event_type: EventType;
  category: EventCategory;
  component: ComponentKey;
  title: string;
  /**
   * Text from the source. For filings and news this is verbatim; for insider
   * trades and market moves it restates the reported figures.
   */
  quote: string;
  quote_kind: QuoteKind;
  /** Where in the source the quote lives, e.g. "10-Q, Item 1A. Risk Factors". */
  source_label: string;
  source_url: string;
  /** Points this event added to its component score (negative lowers risk). */
  score_impact: number;
}
