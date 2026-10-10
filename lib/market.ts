import YahooFinance from "yahoo-finance2";
import type { MarketSnapshot } from "@/types";
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

/**
 * Price context for the memo: 90-day return against the S&P 500, the 52-week
 * range and market capitalization. Daily granularity only.
 */
export async function fetchMarketSnapshot(symbol: string, today: string): Promise<MarketSnapshot | null> {
  const yearAgo = toIsoDate(new Date(Date.parse(`${today}T00:00:00Z`) - 372 * 86_400_000));
  const ninety = toIsoDate(new Date(Date.parse(`${today}T00:00:00Z`) - 90 * 86_400_000));
  const withTimeout = <T,>(p: Promise<T>) =>
    Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Market data timed out")), 15_000))]);

  const [series, benchmark, quote] = await Promise.all([
    withTimeout(fetchPrices(symbol, yearAgo)),
    withTimeout(fetchPrices("SPY", yearAgo)).catch(() => null),
    withTimeout(yahoo.quote(symbol)).catch(() => null),
  ]);
  if (series.length < 2) return null;
  const last = series[series.length - 1];
  const start = series.find((bar) => bar.date >= ninety) ?? series[0];
  const recent = series.filter((bar) => bar.date >= ninety);
  const benchStart = benchmark?.find((bar) => bar.date >= ninety);
  const benchEnd = benchmark?.at(-1);
  return {
    price: last.close,
    priceDate: last.date,
    return90d: last.close / start.close - 1,
    high52w: Math.max(...series.map((b) => b.close)),
    low52w: Math.min(...series.map((b) => b.close)),
    marketCap: typeof quote?.marketCap === "number" ? quote.marketCap : null,
    averageVolume90d: recent.reduce((sum, b) => sum + b.volume, 0) / Math.max(recent.length, 1),
    benchmark: benchStart && benchEnd ? "SPY" : null,
    benchmarkReturn90d: benchStart && benchEnd ? benchEnd.close / benchStart.close - 1 : null,
  };
}
