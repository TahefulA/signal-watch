import { DEMO_TICKERS, POPULAR_TICKERS } from "@/lib/demo-tickers";
import { dailyBudget, spentToday } from "@/lib/visitor";
import { findLatestReport, listAllWatched, releaseLease, takeLease, tigerEnabled } from "@/lib/tiger";
import { traced } from "@/lib/llm-trace";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** A demo report older than this is analysed again; one on someone's watchlist after three days; a popular one after a week. */
const STALE_HOURS = 20;
const WATCHED_STALE_HOURS = 72;
const POPULAR_STALE_HOURS = 24 * 7;

/**
 * Where the cron sends its analyze calls. A deployment's own *.vercel.app URL
 * sits behind Vercel Authentication and answers a 302 to a login page, so in
 * production the calls go to the public domain.
 */
function publicOrigin(request: Request): string {
  const prod = process.env.VERCEL_ENV === "production" ? process.env.VERCEL_PROJECT_PRODUCTION_URL : undefined;
  return prod ? `https://${prod}` : new URL(request.url).origin;
}

/** Reads an NDJSON stream to its last event. */
async function lastEvent(response: Response): Promise<Record<string, unknown> | null> {
  const text = await response.text();
  const lines = text.trim().split("\n").filter(Boolean);
  try {
    return lines.length ? (JSON.parse(lines[lines.length - 1]) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * GET, from Vercel Cron: one step of keeping the demo tickers warm, so each
 * call fits in one function's time. In order: a demo ticker older than
 * STALE_HOURS; the committee for a demo report that has none; a watched
 * ticker older than WATCHED_STALE_HOURS; a popular one older than a week. Runs through the public routes, so it is the same
 * work a visitor would trigger.
 */
async function handleGET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!tigerEnabled()) return Response.json({ skipped: "No database" });
  if ((await spentToday().catch(() => 0)) >= dailyBudget()) return Response.json({ skipped: "Daily AI budget reached" });
  // Two overlapping runs would pick the same stale ticker and pay for it twice.
  if (!(await takeLease("warm", maxDuration))) return Response.json({ skipped: "Another warm-up is running" });
  try {
    return await warmStep(request, secret);
  } finally {
    await releaseLease("warm").catch(() => undefined);
  }
}

async function warmStep(request: Request, secret: string | undefined): Promise<Response> {

  const reports = await Promise.all(DEMO_TICKERS.map(async (ticker) => ({ ticker, report: await findLatestReport(ticker).catch(() => null) })));
  const age = (iso: string | undefined) => (iso ? (Date.now() - Date.parse(iso)) / 3_600_000 : Infinity);
  const origin = publicOrigin(request);
  // The cron's own calls are not counted against the visitor limits.
  const cronAuth: Record<string, string> = secret ? { authorization: `Bearer ${secret}` } : {};

  const byAge = <T extends { report: { generatedAt: string } | null }>(rows: T[], hours: number) =>
    rows.filter((r) => age(r.report?.generatedAt) > hours).sort((a, b) => age(b.report?.generatedAt) - age(a.report?.generatedAt));
  // Rotated by the minute, so a ticker that keeps failing does not hold up the rest.
  const pick = <T,>(list: T[]) => list[Math.floor(Date.now() / 60_000) % (list.length || 1)];

  const analyze = async (ticker: string) => {
    const res = await fetch(`${origin}/api/analyze`, { method: "POST", headers: { "Content-Type": "application/json", ...cronAuth }, body: JSON.stringify({ ticker, fresh: true }), redirect: "manual" });
    // A redirect or an HTML page means the call never reached the route; say so instead of reporting a quiet skip.
    if (!res.ok || !res.headers.get("content-type")?.includes("ndjson")) {
      console.error(`Warm-up could not reach ${origin}/api/analyze: HTTP ${res.status}`);
      return Response.json({ step: "analyze", ticker, refreshed: false, error: `HTTP ${res.status} from ${origin}` }, { status: 502 });
    }
    const last = await lastEvent(res);
    // When Gemini is down the analyze route answers with the saved report (cached: true); that is not a refresh.
    const refreshed = last?.type === "result" && last.cached === false;
    return Response.json({ step: "analyze", ticker, refreshed, message: refreshed ? null : (last?.message ?? "Gemini unavailable; saved report kept") });
  };

  const demo = pick(byAge(reports, STALE_HOURS));
  if (demo) return analyze(demo.ticker);

  const bare = reports.find((r) => r.report && !r.report.committee?.turns.length);
  if (bare?.report) {
    const res = await fetch(`${origin}/api/committee`, { method: "POST", headers: { "Content-Type": "application/json", ...cronAuth }, body: JSON.stringify({ reportId: bare.report.id }), redirect: "manual" });
    if (!res.ok) return Response.json({ step: "committee", ticker: bare.ticker, error: `HTTP ${res.status} from ${origin}` }, { status: 502 });
    const last = await lastEvent(res);
    return Response.json({ step: "committee", ticker: bare.ticker, result: last?.type ?? "no response" });
  }

  // Spare runs go first to names people actually watch, then to popular names, so most searches open instantly.
  const watched = (await listAllWatched(60).catch(() => [] as string[])).filter((t) => !DEMO_TICKERS.includes(t));
  for (const [tickers, hours] of [
    [watched, WATCHED_STALE_HOURS],
    [POPULAR_TICKERS.filter((t) => !watched.includes(t)), POPULAR_STALE_HOURS],
  ] as const) {
    const rows = await Promise.all(tickers.map(async (ticker) => ({ ticker, report: await findLatestReport(ticker).catch(() => null) })));
    const next = pick(byAge(rows, hours));
    if (next) return analyze(next.ticker);
  }
  return Response.json({ step: "none", fresh: DEMO_TICKERS.length });
}

export const GET = traced("warm", handleGET);
