import { buildWatchlist } from "@/lib/dashboard";
import type { WatchlistResponse } from "@/types";
import { addToWatchlist, listWatchlist, removeFromWatchlist, tigerEnabled } from "@/lib/tiger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TICKER = /^[A-Z][A-Z0-9.\-]{0,9}$/;

/** The built queue, reused for a few minutes: each build reads EDGAR and XBRL for every company. */
const CACHE_MS = 5 * 60_000;
let cache: { key: string; at: number; body: WatchlistResponse } | null = null;

/**
 * GET: the queue (one card per watched company, in Act now / Review / Quiet
 * order, with reasons), and one activity feed across them.
 * GET ?tickers=1: just the watched tickers, for the Watch button.
 * GET ?fresh=1: skip the cache.
 */
export async function GET(request: Request): Promise<Response> {
  if (!tigerEnabled()) return Response.json({ error: "The watchlist needs storage, which is not configured." }, { status: 503 });
  const params = new URL(request.url).searchParams;
  try {
    const tickers = await listWatchlist();
    if (params.get("tickers")) return Response.json({ tickers });
    const key = tickers.join(",");
    if (!params.get("fresh") && cache && cache.key === key && Date.now() - cache.at < CACHE_MS) return Response.json(cache.body);
    const body = await buildWatchlist(tickers);
    cache = { key, at: Date.now(), body };
    return Response.json(body);
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
    cache = null;
    return Response.json({ tickers: await listWatchlist() });
  } catch (error) {
    console.error("Watchlist update failed", error);
    return Response.json({ error: "The watchlist could not be updated. Please try again." }, { status: 500 });
  }
}
