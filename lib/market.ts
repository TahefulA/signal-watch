import YahooFinance from "yahoo-finance2";
import { toIsoDate } from "./dates";

export interface PriceBar {
  date: string;
  close: number;
  volume: number;
}

export type PriceSeries = PriceBar[];

const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const memo = new Map<string, Promise<PriceSeries>>();

/** Daily closes from Yahoo Finance via yahoo-finance2. */
export function fetchPrices(symbol: string, startIso: string): Promise<PriceSeries> {
  const key = `${symbol}:${startIso}`;
  const existing = memo.get(key);
  if (existing) return existing;
  const request = yahoo
    .chart(symbol, { period1: startIso, interval: "1d" })
    .then((result) =>
      result.quotes
        .filter((q) => q.close !== null && q.close !== undefined)
        .map((q) => ({ date: toIsoDate(q.date), close: q.adjclose ?? q.close ?? 0, volume: q.volume ?? 0 })),
    );
  memo.set(key, request);
  return request;
}

/** Index of the last bar on or before the date, or -1. */
export function barIndexAt(series: PriceSeries, iso: string): number {
  let lo = 0;
  let hi = series.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].date <= iso) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

export function closeAt(series: PriceSeries, iso: string): number | null {
  const i = barIndexAt(series, iso);
  return i >= 0 ? series[i].close : null;
}

/** Return over the trailing N trading sessions ending on or before the date. */
export function trailingReturn(series: PriceSeries, iso: string, sessions: number): number | null {
  const end = barIndexAt(series, iso);
  const start = end - sessions;
  if (end < 0 || start < 0) return null;
  return series[end].close / series[start].close - 1;
}

/** Return from the first close on or after the date to the close N calendar days later. */
export function forwardReturn(series: PriceSeries, iso: string, endIso: string): number | null {
  const startIndex = series.findIndex((bar) => bar.date >= iso);
  const endIndex = barIndexAt(series, endIso);
  if (startIndex < 0 || endIndex <= startIndex) return null;
  return series[endIndex].close / series[startIndex].close - 1;
}

export function yahooQuoteUrl(symbol: string): string {
  return `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/history/`;
}
