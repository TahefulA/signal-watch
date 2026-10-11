import { NextResponse } from "next/server";
import { closeAt, fetchPrices } from "@/lib/market";

export const runtime = "nodejs";

export interface MarketContextRow {
  label: string;
  symbol: string;
  /** "%" for yields, "$" for prices. */
  unit: "%" | "$";
  start: { date: string; value: number } | null;
  end: { date: string; value: number } | null;
}

/**
 * Market context over a window: the 10-year Treasury yield, the company's share
 * price and the S&P 500, from Yahoo Finance. Bond spreads and prices are not
 * included: Signal Watch has no bond price feed.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const ticker = (url.searchParams.get("ticker") ?? "").toUpperCase();
  const start = url.searchParams.get("start") ?? "";
  const end = url.searchParams.get("end") ?? "";
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(ticker) || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return NextResponse.json({ error: "ticker, start and end are required." }, { status: 400 });
  }
  const symbols: Omit<MarketContextRow, "start" | "end">[] = [
    { label: "10Y Treasury", symbol: "^TNX", unit: "%" },
    { label: `${ticker} share price`, symbol: ticker, unit: "$" },
    { label: "S&P 500 (SPY)", symbol: "SPY", unit: "$" },
  ];
  const rows = await Promise.all(
    symbols.map(async (s): Promise<MarketContextRow> => {
      const series = await fetchPrices(s.symbol, start).catch(() => []);
      const first = series.find((b) => b.date >= start);
      const lastClose = closeAt(series, end);
      const lastBar = [...series].reverse().find((b) => b.date <= end);
      return {
        ...s,
        start: first ? { date: first.date, value: first.close } : null,
        end: lastBar && lastClose !== null ? { date: lastBar.date, value: lastClose } : null,
      };
    }),
  );
  return NextResponse.json({ rows }, { headers: { "Cache-Control": "public, s-maxage=3600" } });
}
