import { NextResponse } from "next/server";
import { getBacktest } from "@/lib/backtest-store";

/**
 * The backtest needs a year of filings, trades and headlines for every ticker,
 * so it runs offline (scripts/backtest.ts) and this route serves the result.
 */
export async function GET() {
  const report = getBacktest();
  if (!report) return NextResponse.json({ error: "No backtest has been run yet." }, { status: 404 });
  return NextResponse.json(report);
}
