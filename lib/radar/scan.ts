import type { CommitteeRecord, CommitteeTurn, NewsEvent, RadarScan, Report, Strength } from "@/types";
import { tableHeadline } from "../committee/news";
import { patternsFor } from "../committee/patterns";
import { toIsoDate } from "../dates";
import { fetchPrices } from "../market";
import { fetchRecentNews } from "../news";
import { findLatestReport, queryRows, saveCommittee, tigerEnabled } from "../tiger";
import { NOVELTY_MIN, nameWords, novelty } from "./novelty";
import { marketReaction } from "./reaction";
import { RELEVANCE_MIN, scoreHeadlines } from "./score";

/**
 * The news radar for one borrower. Runs hourly from cron, and on demand:
 *
 *   fetch → dedupe (novelty, in code) → label (one model call, novel headlines only)
 *         → relevance cut (code) → market reaction (code, daily prices)
 *         → table the strongest new event in the committee (referee + verifier)
 *
 * The model never sees a headline that is a repeat, and never decides what
 * reaches the committee. News does not change the bankruptcy probability:
 * there is no labelled history of headlines and defaults to fit that weight
 * on, and a hand-picked weight would be a made-up number.
 */

const DAYS = 14;
const NOVELTY_DAYS = 7;
/** A scan within this long reuses the last one rather than fetching again. */
export const RESCAN_MS = 10 * 60_000;
const STRONG_TYPES = new Set(["default_or_missed_payment", "bankruptcy_or_restructuring", "rating_change"]);

const daysBefore = (iso: string, days: number) => toIsoDate(new Date(Date.parse(iso) - days * 86_400_000));

export async function storedEvents(ticker: string, since: string): Promise<NewsEvent[]> {
  const rows = await queryRows<{ event_json: NewsEvent }>("SELECT event_json FROM news_events WHERE ticker = $1 AND published >= $2 ORDER BY published DESC, seen_at DESC", [ticker, since]);
  return rows.map((r) => r.event_json);
}

async function saveEvent(e: NewsEvent): Promise<void> {
  await queryRows(
    "INSERT INTO news_events (ticker, url, published, seen_at, event_json) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (ticker, url) DO UPDATE SET event_json = $5",
    [e.ticker, e.url, e.date, e.seenAt, JSON.stringify(e)],
  );
}

export async function lastScan(ticker: string): Promise<string | null> {
  const rows = await queryRows<{ scanned_at: Date }>("SELECT scanned_at FROM news_scans WHERE ticker = $1", [ticker]);
  return rows[0] ? new Date(rows[0].scanned_at).toISOString() : null;
}

/** Code's weight for a tabled headline: a jump the right way, or a default-type event the model is sure of, is strong. */
export function strengthOf(e: NewsEvent): Strength {
  const r = e.reaction;
  const confirmed = r?.jump && ((e.direction === "negative" && r.ret < 0) || (e.direction === "positive" && r.ret > 0));
  if (confirmed) return "strong";
  if (e.eventType && STRONG_TYPES.has(e.eventType) && (e.confidence ?? 0) >= 0.8) return "strong";
  return (e.relevance ?? 0) >= 0.85 ? "moderate" : "weak";
}

const priority = (e: NewsEvent) => (e.relevance ?? 0) * (e.confidence ?? 0) + (strengthOf(e) === "strong" ? 1 : 0);

export interface ScanResult {
  scan: RadarScan;
  /** Lines added to the committee, when an event was tabled. */
  tabled: { record: CommitteeRecord; added: CommitteeTurn[] } | null;
  reused: boolean;
}

export async function scanTicker(ticker: string, options: { force?: boolean } = {}): Promise<ScanResult | null> {
  if (!tigerEnabled()) return null;
  const report = await findLatestReport(ticker);
  if (!report) return null;
  const now = new Date();
  const today = toIsoDate(now);
  const since = daysBefore(today, DAYS);
  const last = await lastScan(ticker);
  if (!options.force && last && now.getTime() - Date.parse(last) < RESCAN_MS) {
    return { scan: { ticker, scannedAt: last, fetched: 0, fresh: 0, events: await storedEvents(ticker, since) }, tabled: null, reused: true };
  }
  await queryRows("INSERT INTO news_scans (ticker, scanned_at) VALUES ($1, NOW()) ON CONFLICT (ticker) DO UPDATE SET scanned_at = NOW()", [ticker]);

  const company = report.graph.company;
  const shortName = company.name.replace(/,?\s+(Inc|Corp|Co|Ltd|Plc|Corporation|Company|Holdings)\.?$/i, "");
  const items = await fetchRecentNews(`"${shortName}" OR ${ticker} stock`, 20, DAYS, RESCAN_MS);
  const stored = await storedEvents(ticker, daysBefore(today, DAYS + NOVELTY_DAYS));
  const known = new Set(stored.map((e) => e.url));
  // Oldest first, so a story's first report is the original and later rewrites are the repeats.
  const fresh = items.filter((n) => !known.has(n.url)).sort((a, b) => a.date.localeCompare(b.date) || b.credibility - a.credibility);
  const exclude = nameWords(shortName, ticker);
  const seen: { headline: string; date: string }[] = stored.map((e) => ({ headline: e.headline, date: e.date }));
  const drafts = fresh.map((n) => {
    const window = seen.filter((s) => s.date >= daysBefore(n.date, NOVELTY_DAYS) && s.date <= n.date).map((s) => s.headline);
    const nov = novelty(n.headline, window, exclude);
    seen.push({ headline: n.headline, date: n.date });
    return { item: n, novelty: nov.novelty, closest: nov.closest };
  });

  const novel = drafts.filter((d) => d.novelty >= NOVELTY_MIN);
  const scores = await scoreHeadlines(company.name, ticker, novel.map((d) => d.item)).catch((error) => {
    console.warn("Radar scoring failed", ticker, error);
    return null;
  });
  const bars = novel.length ? await fetchPrices(ticker, daysBefore(today, 150)).catch(() => []) : [];
  const seenAt = now.toISOString();

  const events: NewsEvent[] = drafts.map((d) => {
    const base = { ticker, url: d.item.url, headline: d.item.headline, publisher: d.item.publisher, date: d.item.date, seenAt, novelty: d.novelty, tabledTurn: null };
    if (d.novelty < NOVELTY_MIN)
      return { ...base, duplicateOf: d.closest, relevance: null, confidence: null, direction: null, eventType: null, reaction: null, passed: false, reason: `Repeat of an earlier story (novelty ${d.novelty.toFixed(2)}, cut ${NOVELTY_MIN})` };
    const s = scores?.get(novel.indexOf(d));
    const reaction = marketReaction(bars, d.item.date, today);
    if (!s) return { ...base, duplicateOf: null, relevance: null, confidence: null, direction: null, eventType: null, reaction, passed: false, reason: scores ? "The model returned no usable label" : "Not labelled: the model was unavailable" };
    const scored = { ...base, duplicateOf: null, relevance: s.relevance, confidence: s.confidence, direction: s.direction, eventType: s.eventType, reaction };
    if (s.relevance < RELEVANCE_MIN) return { ...scored, passed: false, reason: `Relevance ${s.relevance.toFixed(2)}, below ${RELEVANCE_MIN.toFixed(2)}` };
    if (s.direction === "neutral") return { ...scored, passed: false, reason: "Relevant, but neither good nor bad for lenders" };
    return { ...scored, passed: true, reason: `Passed: relevance ${s.relevance.toFixed(2)}, novelty ${d.novelty.toFixed(2)}` };
  });
  // Unlabelled headlines are not saved, so the next scan tries them again.
  for (const e of events) if (e.relevance !== null || e.duplicateOf !== null || e.reason.startsWith("The model")) await saveEvent(e);

  const tabled = await tableBest(report, [...events, ...stored]);
  const all = await storedEvents(ticker, since);
  return { scan: { ticker, scannedAt: seenAt, fetched: items.length, fresh: fresh.length, events: all }, tabled, reused: false };
}

/** Puts the strongest passed headline of the radar window that the committee has not seen to the committee. One per scan, so a news day does not take over the debate. */
async function tableBest(report: Report, events: NewsEvent[]): Promise<ScanResult["tabled"]> {
  const record = report.committee;
  if (!record?.turns.length) return null;
  const onTable = new Set(record.turns.filter((t) => t.evidence?.kind === "news").map((t) => t.evidence?.source.url));
  const since = daysBefore(toIsoDate(new Date()), DAYS);
  const best = events.filter((e) => e.passed && !onTable.has(e.url) && e.date >= since).sort((a, b) => priority(b) - priority(a))[0];
  if (!best) return null;
  const patterns = await patternsFor(report, toIsoDate(new Date()));
  const result = await tableHeadline(report, patterns, record, best, strengthOf(best));
  await saveCommittee(report, result.record);
  await saveEvent({ ...best, tabledTurn: result.added[0].id });
  return result;
}
