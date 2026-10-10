import { watchCard } from "@/lib/dashboard";
import { addToWatchlist, listWatchlist, removeFromWatchlist, tigerEnabled } from "@/lib/tiger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TICKER = /^[A-Z][A-Z0-9.\-]{0,9}$/;

/** GET: one card per watched company, with alerts for filings newer than its last report. */
export async function GET(): Promise<Response> {
  if (!tigerEnabled()) return Response.json({ error: "The watchlist needs storage, which is not configured." }, { status: 503 });
  try {
    const tickers = await listWatchlist();
    const cards = await Promise.all(tickers.map((t) => watchCard(t)));
    return Response.json({ cards });
  } catch (error) {
    console.error("Watchlist failed", error);
    return Response.json({ error: "The watchlist could not be loaded. Please try again." }, { status: 500 });
  }
}

/** POST { ticker, action: "add" | "remove" } */
export async function POST(request: Request): Promise<Response> {
  if (!tigerEnabled()) return Response.json({ error: "The watchlist needs storage, which is not configured." }, { status: 503 });
  let body: { ticker?: unknown; action?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const ticker = typeof body.ticker === "string" ? body.ticker.trim().toUpperCase() : "";
  if (!TICKER.test(ticker)) return Response.json({ error: "That is not a valid ticker." }, { status: 400 });
  try {
    if (body.action === "remove") await removeFromWatchlist(ticker);
    else await addToWatchlist(ticker);
    return Response.json({ tickers: await listWatchlist() });
  } catch (error) {
    console.error("Watchlist update failed", error);
    return Response.json({ error: "The watchlist could not be updated. Please try again." }, { status: 500 });
  }
}
