import type { ComponentKey } from "./signal";

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
  /** Verbatim text from the source document. */
  quote: string;
  /** Where in the source the quote lives, e.g. "10-Q, Item 1A. Risk Factors". */
  source_label: string;
  source_url: string;
  /** Points this event added to its component score (negative lowers risk). */
  score_impact: number;
}
