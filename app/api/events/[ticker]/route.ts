import { NextResponse } from "next/server";
import { getDataset } from "@/lib/data";

export const revalidate = 3600;

/** Events for a ticker. ?min_impact=5 keeps only events that moved a component by at least that much. */
export async function GET(request: Request, { params }: { params: { ticker: string } }) {
  const dataset = await getDataset(params.ticker);
  if (!dataset) {
    return NextResponse.json({ error: `${params.ticker.toUpperCase()} is not on the watchlist.` }, { status: 404 });
  }
  const minImpact = Number(new URL(request.url).searchParams.get("min_impact") ?? 0);
  const events = dataset.events
    .filter((e) => Math.abs(e.score_impact) >= (Number.isFinite(minImpact) ? minImpact : 0))
    .sort((a, b) => b.date.localeCompare(a.date));
  return NextResponse.json({ ticker: dataset.profile.ticker, events });
}
