import { NextResponse } from "next/server";
import { CASH, REVENUE } from "@/lib/capital";
import { type SeriesPoint, fetchFacts, instantSeries, quarterlySeries } from "@/lib/xbrl";

export const runtime = "nodejs";

export interface HistoryResponse {
  /** Three-month revenue by quarter end. */
  revenue: SeriesPoint[];
  cash: SeriesPoint[];
}

/**
 * Up to eight quarters of revenue and cash from the company's XBRL data, ending
 * at the report's balance sheet date. Debt is left out: companies switch debt
 * concepts between filings, so a tagged debt history jumps for no real reason.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const cik = url.searchParams.get("cik") ?? "";
  const through = url.searchParams.get("through") ?? "";
  if (!/^\d{1,10}$/.test(cik) || !/^\d{4}-\d{2}-\d{2}$/.test(through)) {
    return NextResponse.json({ error: "cik and through (YYYY-MM-DD) are required." }, { status: 400 });
  }
  const book = await fetchFacts(cik).catch(() => null);
  if (!book) return NextResponse.json({ error: "XBRL data is not available for this company." }, { status: 502 });
  const body: HistoryResponse = { revenue: quarterlySeries(book, REVENUE, through), cash: instantSeries(book, CASH, through) };
  return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=43200" } });
}
