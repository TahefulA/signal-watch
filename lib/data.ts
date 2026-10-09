import "server-only";
import type { SignalEvent, TickerDataset, TickerSummary } from "@/types";
import wulf from "@/fixtures/wulf.json";
import ford from "@/fixtures/f.json";
import att from "@/fixtures/t.json";
import { loadDataset as loadFromTiger, tigerEnabled } from "./tiger";

function isDataset(value: unknown): value is TickerDataset {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.profile === "object" && Array.isArray(v.scores) && Array.isArray(v.events) && typeof v.reason === "string";
}

const FIXTURES: TickerDataset[] = [wulf, ford, att].filter(isDataset);

export const TRACKED_TICKERS: string[] = FIXTURES.map((d) => d.profile.ticker);

/** Reads from Tiger Data when configured, falling back to the bundled snapshot. */
export async function getDataset(ticker: string): Promise<TickerDataset | null> {
  const symbol = ticker.toUpperCase();
  if (tigerEnabled()) {
    try {
      const stored = await loadFromTiger(symbol);
      if (stored && stored.scores.length > 0) return stored;
    } catch (error) {
      console.error(`Tiger Data read failed for ${symbol}`, error);
    }
  }
  return FIXTURES.find((d) => d.profile.ticker === symbol) ?? null;
}

export function summarize(dataset: TickerDataset): TickerSummary {
  const scores = dataset.scores;
  const latest = scores.at(-1)?.total_score ?? 0;
  const weekAgo = scores.at(-8)?.total_score ?? latest;
  return {
    ticker: dataset.profile.ticker,
    name: dataset.profile.name,
    latest_score: latest,
    change_7d: Math.round((latest - weekAgo) * 10) / 10,
    reason: dataset.reason,
    sparkline: scores.slice(-30).map((s) => s.total_score),
  };
}

export async function getSummaries(): Promise<TickerSummary[]> {
  const datasets = await Promise.all(TRACKED_TICKERS.map((t) => getDataset(t)));
  return datasets
    .filter((d): d is TickerDataset => d !== null)
    .map(summarize)
    .sort((a, b) => b.latest_score - a.latest_score);
}

export async function getEvents(ticker: string): Promise<SignalEvent[]> {
  return (await getDataset(ticker))?.events ?? [];
}
