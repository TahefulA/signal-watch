import { buildWatchlist } from "@/lib/dashboard";
import type { WatchlistResponse } from "@/types";
import { addVisitorTicker, listVisitorWatchlist, removeVisitorTicker, seedVisitorWatchlist, tigerEnabled } from "@/lib/tiger";
import { newVisitor, readVisitor } from "@/lib/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TICKER = /^[A-Z][A-Z0-9.\-]{0,9}$/;

/** Built queues, reused for a few minutes and keyed by the ticker list: each build reads EDGAR and XBRL for every company. */
const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { at: number; body: WatchlistResponse }>();

/** The visitor's id, minting one (seeded with the demo list) on a first visit. */
async function visitorOf(request: Request): Promise<{ id: string; cookie: string | null }> {
  const id = readVisitor(request);
  if (id) return { id, cookie: null };
  const v = newVisitor();
  await seedVisitorWatchlist(v.id);
  return { id: v.id, cookie: v.cookie };
}

function withCookie(response: Response, cookie: string | null): Response {
  if (cookie) response.headers.append("Set-Cookie", cookie);
  return response;
}

/**
 * Each visitor has their own list, kept by a cookie; a first visit starts from a copy of the demo list.
 * GET: the queue (one card per watched company, in Act now / Review / Quiet
 * order, with reasons), and one activity feed across them.
 * GET ?tickers=1: just the watched tickers, for the Watch button.
 * GET ?fresh=1: skip the cache.
 */
export async function GET(request: Request): Promise<Response> {
  if (!tigerEnabled()) return Response.json({ error: "The watchlist needs storage, which is not configured." }, { status: 503 });
  const params = new URL(request.url).searchParams;
  try {
    const visitor = await visitorOf(request);
    const tickers = await listVisitorWatchlist(visitor.id);
    if (params.get("tickers")) return withCookie(Response.json({ tickers }), visitor.cookie);
    const key = tickers.join(",");
    const hit = cache.get(key);
    if (!params.get("fresh") && hit && Date.now() - hit.at < CACHE_MS) return withCookie(Response.json(hit.body), visitor.cookie);
    const body = await buildWatchlist(tickers);
    if (cache.size > 50) cache.clear();
    cache.set(key, { at: Date.now(), body });
    return withCookie(Response.json(body), visitor.cookie);
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
    const visitor = await visitorOf(request);
    if (body.action === "remove") await removeVisitorTicker(visitor.id, ticker);
    else await addVisitorTicker(visitor.id, ticker);
    return withCookie(Response.json({ tickers: await listVisitorWatchlist(visitor.id) }), visitor.cookie);
  } catch (error) {
    console.error("Watchlist update failed", error);
    return Response.json({ error: "The watchlist could not be updated. Please try again." }, { status: 500 });
  }
}
