import { createHash } from "node:crypto";
import type { ComponentKey, EventCategory, EventType, QuoteKind, SignalEvent } from "@/types";

export interface EventInput {
  ticker: string;
  date: string;
  event_type: EventType;
  category: EventCategory;
  component: ComponentKey;
  title: string;
  quote: string;
  quote_kind: QuoteKind;
  source_label: string;
  source_url: string;
  score_impact: number;
}

export function makeEvent(input: EventInput): SignalEvent {
  const id = createHash("sha1")
    .update([input.ticker, input.date, input.component, input.title, input.quote].join("|"))
    .digest("hex")
    .slice(0, 12);
  return { id: `${input.ticker.toLowerCase()}-${id}`, ...input };
}

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function formatPercent(value: number): string {
  const pct = round1(value * 100);
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

export function formatShares(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** Linear decay: full weight on the event date, zero after `days`. */
export function decayWeight(ageDays: number, days: number): number {
  if (ageDays < 0 || ageDays >= days) return 0;
  return 1 - ageDays / days;
}

export interface ComponentDay {
  value: number;
  drivers: string[];
  note: string;
}
