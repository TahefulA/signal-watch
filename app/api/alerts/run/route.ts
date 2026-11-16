import { buildWatchlist } from "@/lib/dashboard";
import { emailEnabled, sendEmail, siteUrl } from "@/lib/email";
import { type Change, type Sub, compose, syncWatchlistSubs } from "@/lib/digest/digest";
import { getPool, queryRows, tigerEnabled } from "@/lib/tiger";
import { traced } from "@/lib/llm-trace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const pctText = (p: number) => `${(p * 100).toFixed(p < 0.01 ? 2 : 1)}%`;

/** A move in the odds worth an email: at least half a point, and at least a quarter of where it was. */
const moved = (before: number, now: number) => Math.abs(now - before) >= Math.max(0.005, before * 0.25);
const MAX_TICKERS = 60;

/**
 * GET, from Vercel Cron, once a day: for each company someone subscribed to,
 * or watches with watchlist emails on, rebuild its watchlist card (fresh EDGAR
 * filings, the latest score) and send each address one email covering what
 * changed since its last email. A new subscription's first run only records
 * where things stand. Without an email key nothing is recorded, so nothing is
 * lost before email is set up.
 *
 * GET ?dry=1 returns the emails it would send, and changes nothing.
 */
async function handleGET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!tigerEnabled()) return Response.json({ skipped: "No database" });
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  if (!dry && !emailEnabled()) return Response.json({ skipped: "Set RESEND_API_KEY and ALERT_FROM to send alerts" });

  if (!dry) await syncWatchlistSubs();
  const subs = await queryRows<Sub>("SELECT token, email, ticker, user_id::text AS user_id, last_prob, last_event::text AS last_event, created_at::text AS created_at FROM alert_subs");
  const tickers = [...new Set(subs.map((s) => s.ticker))].slice(0, MAX_TICKERS);
  if (!tickers.length) return Response.json({ subs: 0 });
  const { cards } = await buildWatchlist(tickers);

  let baselined = 0;
  const byEmail = new Map<string, Change[]>();
  for (const sub of subs) {
    const card = cards.find((c) => c.ticker === sub.ticker);
    if (!card) continue;
    const prob = card.distress?.probability ?? null;
    const since = sub.last_event ?? sub.created_at.slice(0, 10);
    const events = card.reasons.filter((r) => r.date && r.date > since);
    const newest = events.reduce<string | null>((m, r) => (r.date && (!m || r.date > m) ? r.date : m), sub.last_event) ?? since;

    if (sub.last_prob === null && sub.last_event === null) {
      // First look: record where things stand, so the first email is about a change.
      if (!dry) await getPool().query("UPDATE alert_subs SET last_prob = $2, last_event = $3 WHERE token = $1", [sub.token, prob, newest]);
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
    byEmail.set(sub.email, [...(byEmail.get(sub.email) ?? []), { sub, name: card.name ?? sub.ticker, lines, prob, newest }]);
  }

  if (dry) {
    return Response.json({ dry: true, subs: subs.length, tickers: tickers.length, baselined, emails: [...byEmail.values()].map((changes) => compose(changes, siteUrl())) });
  }

  let sent = 0;
  for (const [email, changes] of byEmail) {
    const { subject, text } = compose(changes, siteUrl());
    const ok = await sendEmail(email, subject, text).catch(() => false);
    if (!ok) continue;
    sent++;
    for (const c of changes) {
      await getPool().query("UPDATE alert_subs SET last_prob = $2, last_event = $3, last_sent = NOW() WHERE token = $1", [c.sub.token, c.prob ?? c.sub.last_prob, c.newest]);
    }
  }
  return Response.json({ subs: subs.length, tickers: tickers.length, emails: sent, baselined });
}

export const GET = traced("alerts/run", handleGET);
