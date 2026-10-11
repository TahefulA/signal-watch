import { NextResponse } from "next/server";
import { CAPEX, CASH, DEPRECIATION, OPERATING_CASH, OPERATING_INCOME, REVENUE } from "@/lib/capital";
import { type SeriesPoint, fetchFacts, instantSeries, quarterlySeries } from "@/lib/xbrl";

export const runtime = "nodejs";

export interface HistoryResponse {
  /** Three-month revenue by quarter end. */
  revenue: SeriesPoint[];
  /** Three-month operating income plus depreciation and amortization, where both are tagged. */
  ebitda: SeriesPoint[];
  /** Quarterly EBITDA over quarterly revenue, in percent. */
  ebitdaMargin: SeriesPoint[];
  cash: SeriesPoint[];
  /** Current assets over current liabilities at each balance sheet date. */
  currentRatio: SeriesPoint[];
  /** Three-month operating cash flow less capital spending, where both are tagged. */
  fcf: SeriesPoint[];
}

const QUARTERS = 12;

/**
 * Up to twelve quarters of revenue, EBITDA, margin, cash and current ratio from
 * the company's XBRL data, ending at the report's balance sheet date. Debt is
 * left out: companies switch debt concepts between filings, so a tagged debt
 * history jumps for no real reason.
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

  const revenue = quarterlySeries(book, REVENUE, through, QUARTERS);
  const operating = quarterlySeries(book, OPERATING_INCOME, through, QUARTERS + 4);
  const depreciation = quarterlySeries(book, DEPRECIATION, through, QUARTERS + 4);
  const ebitda = operating
    .map((o) => {
      const d = depreciation.find((x) => x.end === o.end);
      return d ? { end: o.end, value: o.value + d.value } : null;
    })
    .filter((p): p is SeriesPoint => p !== null)
    .slice(-QUARTERS);
  const ebitdaMargin = ebitda
    .map((e) => {
      const r = revenue.find((x) => x.end === e.end);
      return r && r.value > 0 ? { end: e.end, value: (e.value / r.value) * 100 } : null;
    })
    .filter((p): p is SeriesPoint => p !== null);
  const assets = instantSeries(book, ["AssetsCurrent"], through, QUARTERS);
  const liabilities = instantSeries(book, ["LiabilitiesCurrent"], through, QUARTERS);
  const currentRatio = assets
    .map((a) => {
      const l = liabilities.find((x) => x.end === a.end);
      return l && l.value > 0 ? { end: a.end, value: a.value / l.value } : null;
    })
    .filter((p): p is SeriesPoint => p !== null);

  const ocf = quarterlySeries(book, OPERATING_CASH, through, QUARTERS);
  const capex = quarterlySeries(book, CAPEX, through, QUARTERS);
  const fcf = ocf
    .map((o) => {
      const c = capex.find((x) => x.end === o.end);
      return c ? { end: o.end, value: o.value - c.value } : null;
    })
    .filter((p): p is SeriesPoint => p !== null);

  const body: HistoryResponse = { revenue, ebitda, ebitdaMargin, cash: instantSeries(book, CASH, through, QUARTERS), currentRatio, fcf };
  return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=43200" } });
}
