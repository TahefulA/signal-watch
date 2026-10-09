import { NextResponse } from "next/server";
import { getDataset, summarize } from "@/lib/data";

export const revalidate = 3600;

export async function GET(_request: Request, { params }: { params: { ticker: string } }) {
  const dataset = await getDataset(params.ticker);
  if (!dataset) {
    return NextResponse.json({ error: `${params.ticker.toUpperCase()} is not on the watchlist.` }, { status: 404 });
  }
  return NextResponse.json({
    profile: dataset.profile,
    summary: summarize(dataset),
    latest: dataset.scores.at(-1) ?? null,
    scores: dataset.scores,
    generated_at: dataset.generated_at,
  });
}
