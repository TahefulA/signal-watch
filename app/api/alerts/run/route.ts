import { buildWatchlist } from "@/lib/dashboard";
import { emailEnabled, sendEmail, siteUrl } from "@/lib/email";
import { getPool, queryRows, tigerEnabled } from "@/lib/tiger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const pctText = (p: number) => `${(p * 100).toFixed(p < 0.01 ? 2 : 1)}%`;

/** A move in the odds worth an email: at least half a point, and at least a quarter of where it was. */
const moved = (before: number, now: number) => Math.abs(now - before) >= Math.max(0.005, before * 0.25);
const MAX_TICKERS = 40;

type Sub = { token: string; email: string; ticker: string; last_prob: number | null; last_event: string | null; created_at: string };

/**
 * GET, from Vercel Cron, once a day: for each company someone subscribed to,
 * rebuild its watchlist card (fresh EDGAR filings, the latest score) and email
 * each subscriber what changed since their last email. The first run for a
 * subscription only records where things stand. Without an email key nothing
 * is recorded, so nothing is lost before email is set up.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!tigerEnabled()) return Response.json({ skipped: "No database" });
  if (!emailEnabled()) return Response.json({ skipped: "Set RESEND_API_KEY and ALERT_FROM to send alerts" });

  const subs = await queryRows<Sub>("SELECT token, email, ticker, last_prob, last_event::text AS last_event, created_at::text AS created_at FROM alert_subs");
  const tickers = [...new Set(subs.map((s) => s.ticker))].slice(0, MAX_TICKERS);
  if (!tickers.length) return Response.json({ subs: 0 });
  const { cards } = await buildWatchlist(tickers);

  let sent = 0;
  let baselined = 0;
  for (const sub of subs) {
    const card = cards.find((c) => c.ticker === sub.ticker);
    if (!card) continue;
    const prob = card.distress?.probability ?? null;
    const since = sub.last_event ?? sub.created_at.slice(0, 10);
    const events = card.reasons.filter((r) => r.date && r.date > since);
    const newest = events.reduce<string | null>((m, r) => (r.date && (!m || r.date > m) ? r.date : m), sub.last_event);

    if (sub.last_prob === null && sub.last_event === null) {
      // First look: record where things stand, so the first email is about a change.
      await getPool().query("UPDATE alert_subs SET last_prob = $2, last_event = $3 WHERE token = $1", [sub.token, prob, newest ?? since]);
      baselined++;
      continue;
    }
    const oddsMoved = prob !== null && sub.last_prob !== null && moved(sub.last_prob, prob);
    if (!oddsMoved && !events.length) continue;

    const lines: string[] = [];
    if (oddsMoved && prob !== null && sub.last_prob !== null) {
      lines.push(`12-month bankruptcy odds: ${pctText(prob)}, ${prob > sub.last_prob ? "up" : "down"} from ${pctText(sub.last_prob)}.`);
    }
    for (const e of events) lines.push(`- ${e.text.replace(/\s*\(items? [\d., ]+\)/g, "")}${e.date ? ` (${e.date})` : ""}`);
    const ok = await sendEmail(
      sub.email,
      `Signal Watch: ${sub.ticker} ${oddsMoved ? "odds moved" : "filed something new"}`,
      `${card.name ?? sub.ticker} (${sub.ticker})\n\n${lines.join("\n")}\n\nOpen it: ${siteUrl()}/company?ticker=${sub.ticker}\nStop these emails: ${siteUrl()}/api/alerts/unsubscribe?token=${sub.token}\n\nNot financial advice.`,
    ).catch(() => false);
    if (!ok) continue;
    sent++;
    await getPool().query("UPDATE alert_subs SET last_prob = $2, last_event = $3, last_sent = NOW() WHERE token = $1", [sub.token, prob ?? sub.last_prob, newest ?? since]);
  }
  return Response.json({ subs: subs.length, tickers: tickers.length, sent, baselined });
}
