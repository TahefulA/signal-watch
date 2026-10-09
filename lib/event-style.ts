import type { EventCategory, SignalEvent } from "@/types";

export interface CategoryStyle {
  label: string;
  /** Marker fill on the dark surface. */
  color: string;
  swatch: string;
}

export const CATEGORY_STYLES: Record<EventCategory, CategoryStyle> = {
  filing: { label: "SEC filing", color: "#3B82F6", swatch: "bg-blue-500" },
  news_positive: { label: "Positive news", color: "#10B981", swatch: "bg-emerald-500" },
  news_negative: { label: "Negative news", color: "#EF4444", swatch: "bg-red-500" },
  insider: { label: "Insider trade", color: "#F59E0B", swatch: "bg-amber-500" },
  market: { label: "Market move", color: "#A1A1AA", swatch: "bg-zinc-400" },
};

export const CATEGORY_ORDER: EventCategory[] = ["filing", "news_positive", "news_negative", "insider", "market"];

/** The event that best represents a day: largest absolute score impact, filings first on ties. */
export function leadEvent(events: SignalEvent[]): SignalEvent | undefined {
  return [...events].sort(
    (a, b) =>
      Math.abs(b.score_impact) - Math.abs(a.score_impact) ||
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
  )[0];
}
