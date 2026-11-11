import { DEMO_TICKERS } from "@/lib/demo-tickers";
import { findLatestReport, tigerEnabled } from "@/lib/tiger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** A demo report older than this is analysed again. */
const STALE_HOURS = 20;

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
 * call fits in one function's time. Analyses the stalest demo ticker if any
 * is older than STALE_HOURS; otherwise convenes the committee for a demo
 * report that has none. Runs through the public routes, so it is the same
 * work a visitor would trigger.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!tigerEnabled()) return Response.json({ skipped: "No database" });

  const reports = await Promise.all(DEMO_TICKERS.map(async (ticker) => ({ ticker, report: await findLatestReport(ticker).catch(() => null) })));
  const age = (iso: string | undefined) => (iso ? (Date.now() - Date.parse(iso)) / 3_600_000 : Infinity);
  const origin = new URL(request.url).origin;

  const staleList = reports.filter((r) => age(r.report?.generatedAt) > STALE_HOURS).sort((a, b) => age(b.report?.generatedAt) - age(a.report?.generatedAt));
  // Rotated by the minute, so a ticker that keeps failing does not hold up the rest.
  const stale = staleList[Math.floor(Date.now() / 60_000) % (staleList.length || 1)];
  if (stale) {
    const res = await fetch(`${origin}/api/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker: stale.ticker, fresh: true }) });
    const last = await lastEvent(res);
    // When Gemini is down the analyze route answers with the saved report (cached: true); that is not a refresh.
    const refreshed = last?.type === "result" && last.cached === false;
    return Response.json({ step: "analyze", ticker: stale.ticker, refreshed, message: refreshed ? null : (last?.message ?? "Gemini unavailable; saved report kept") });
  }

  const bare = reports.find((r) => r.report && !r.report.committee?.turns.length);
  if (bare?.report) {
    const res = await fetch(`${origin}/api/committee`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportId: bare.report.id }) });
    const last = await lastEvent(res);
    return Response.json({ step: "committee", ticker: bare.ticker, result: last?.type ?? "no response" });
  }
  return Response.json({ step: "none", fresh: DEMO_TICKERS.length });
}
