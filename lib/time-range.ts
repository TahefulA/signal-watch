import type { TimelineQuarter } from "@/types";

export type RangeKind = "quarter" | "fiscal_year" | "last4" | "last8" | "last12" | "custom";

export interface TimeRange {
  kind: RangeKind;
  /** Quarter labels for a custom range, e.g. "Q1 2025". */
  start?: string;
  end?: string;
}

export const RANGE_OPTIONS: { kind: RangeKind; label: string }[] = [
  { kind: "quarter", label: "Current quarter" },
  { kind: "fiscal_year", label: "Current fiscal year" },
  { kind: "last4", label: "Last 4 quarters" },
  { kind: "last8", label: "Last 8 quarters" },
  { kind: "last12", label: "Last 12 quarters" },
  { kind: "custom", label: "Custom range" },
];

export const DEFAULT_RANGE: TimeRange = { kind: "quarter" };
const KEY = "signal-watch:time-range";

export function readRange(): TimeRange {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && "kind" in parsed && RANGE_OPTIONS.some((o) => o.kind === (parsed as TimeRange).kind)) return parsed as TimeRange;
  } catch {
    // Fall back to the default range.
  }
  return DEFAULT_RANGE;
}

export function saveRange(range: TimeRange) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(range));
  } catch {
    // The range still applies for this visit.
  }
}

/** Inclusive indexes into the timeline's quarters (oldest first) that the range covers. */
export function windowOf(quarters: TimelineQuarter[], range: TimeRange): { start: number; end: number } {
  const last = quarters.length - 1;
  if (last < 0) return { start: 0, end: -1 };
  const lastN = (n: number) => ({ start: Math.max(0, last - n + 1), end: last });
  switch (range.kind) {
    case "quarter":
      return lastN(1);
    case "fiscal_year": {
      // The latest 10-K and the 10-Qs filed after it.
      let k = last;
      while (k > 0 && quarters[k].form !== "10-K") k--;
      return { start: quarters[k].form === "10-K" ? k : 0, end: last };
    }
    case "last4":
      return lastN(4);
    case "last8":
      return lastN(8);
    case "last12":
      return lastN(12);
    case "custom": {
      const s = quarters.findIndex((q) => q.label === range.start);
      const e = quarters.findIndex((q) => q.label === range.end);
      if (s < 0 || e < 0) return lastN(4);
      return { start: Math.min(s, e), end: Math.max(s, e) };
    }
  }
}

/** First day of the quarter that ends on the given balance sheet date. */
export function quarterStart(periodEnd: string): string {
  const d = new Date(`${periodEnd}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 3);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function describeWindow(quarters: TimelineQuarter[], w: { start: number; end: number }): string {
  if (w.end < 0) return "";
  const n = w.end - w.start + 1;
  return n === 1 ? quarters[w.end].label : `${quarters[w.start].label} → ${quarters[w.end].label} (${n} quarters)`;
}
