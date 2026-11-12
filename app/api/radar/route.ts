import { DEMO_TICKERS } from "@/lib/demo-tickers";
import { lastScan, scanTicker, storedEvents } from "@/lib/radar/scan";
import { listWatchlist, tigerEnabled } from "@/lib/tiger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;
const MAX_PER_RUN = 20;

/**
 * GET from Vercel Cron: scans the demo tickers and the watchlist, oldest scan
 * first. GET ?ticker=X: that borrower's radar as last scanned, without
 * fetching. POST { ticker }: scan now (at most once every ten minutes).
 */
export async function GET(request: Request) {
  if (!tigerEnabled()) return Response.json({ error: "Saved reports are not available." }, { status: 503 });
  const ticker = new URL(request.url).searchParams.get("ticker")?.toUpperCase();
  if (ticker) {
    if (!TICKER.test(ticker)) return Response.json({ error: "Bad ticker" }, { status: 400 });
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
    return Response.json({ ticker, scannedAt: await lastScan(ticker), events: await storedEvents(ticker, since) });
  }

  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const tickers = [...new Set([...DEMO_TICKERS, ...(await listWatchlist().catch(() => []))])];
  const ages = await Promise.all(tickers.map(async (t) => ({ t, at: (await lastScan(t).catch(() => null)) ?? "" })));
  const order = ages.sort((a, b) => a.at.localeCompare(b.at)).slice(0, MAX_PER_RUN);
  const started = Date.now();
  const out: Record<string, unknown>[] = [];
  for (const { t } of order) {
    if (Date.now() - started > 240_000) break;
    try {
      const r = await scanTicker(t);
      out.push({ ticker: t, fresh: r?.scan.fresh ?? 0, passed: r?.scan.events.filter((e) => e.passed && e.seenAt === r.scan.scannedAt).length ?? 0, tabled: r?.tabled?.added[0]?.id ?? null });
    } catch (error) {
      out.push({ ticker: t, error: error instanceof Error ? error.message : "failed" });
    }
  }
  return Response.json({ scanned: out });
}

export async function POST(request: Request) {
  if (!tigerEnabled()) return Response.json({ error: "Saved reports are not available." }, { status: 503 });
  let body: { ticker?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const ticker = typeof body.ticker === "string" ? body.ticker.toUpperCase() : "";
  if (!TICKER.test(ticker)) return Response.json({ error: "Bad ticker" }, { status: 400 });
  try {
    const result = await scanTicker(ticker);
    if (!result) return Response.json({ error: "Analyse this ticker first." }, { status: 404 });
    return Response.json(result);
  } catch (error) {
    console.error("Radar scan failed", error);
    return Response.json({ error: "The news could not be read. Please try again." }, { status: 500 });
  }
}
