import type { FeedEvent, Report, WatchCard, WatchItemStatus, WatchReason, WatchStatus } from "@/types";
import { CASH, CAPEX, OPERATING_CASH, money } from "./capital";
import { addDays, daysBetween, toIsoDate } from "./dates";
import { describeItems } from "./devils-evidence";
import { filingDocumentUrl, getSubmissions, lookupCik } from "./edgar";
import { findLatestReport } from "./tiger";
import { fetchFacts, instantSeries, quarterlySeries } from "./xbrl";

/**
 * The watchlist as a morning queue. Each company is placed in Act now, Review
 * or Quiet by the written rules below, and every rule that applies is shown as
 * a reason with its date and source. There is no score: a reader can check
 * each reason against the filing it links to.
 *
 * Act now
 *   - an 8-K since the report under item 1.03 (bankruptcy), 2.04 (debt
 *     accelerated), 3.01 (delisting notice) or 4.02 (earlier statements not to
 *     be relied on)
 *   - cash covers fewer than four quarters of the latest quarter's cash burn
 *   - debt due within twelve months exceeds cash
 * Review
 *   - a new 10-Q or 10-K since the report
 *   - an 8-K since the report about new debt, an auditor change, an officer
 *     leaving, a material agreement, an impairment or a change in control
 *   - cash covers four to eight quarters of the latest burn
 *   - debt due within two years
 *   - the memo reads Stable or Caution while the Devil's Advocate makes three
 *     or more strong points against it
 *   - the stock is down 20% or more over 90 days and 15 points behind the S&P
 *   - cash fell more than 25% in the latest quarter
 *   - a "What to watch" item from the Devil's Advocate can now be checked
 */

const FORMS = new Set(["10-K", "10-Q", "8-K"]);
const ACT_ITEMS = ["1.03", "2.04", "3.01", "4.02"];
const REVIEW_ITEMS = ["1.01", "1.02", "2.01", "2.03", "2.05", "2.06", "4.01", "5.01", "5.02"];
const FEED_PAST_DAYS = 120;
const FEED_AHEAD_DAYS = 730;
const MAX_INSIDER_LINES = 5;

type NewFiling = WatchCard["newFilings"][number];

const codes = (items: string) => items.split(/[,\s]+/).filter(Boolean);
const toneOfItems = (items: string): "act" | "review" | "info" =>
  codes(items).some((c) => ACT_ITEMS.includes(c)) ? "act" : codes(items).some((c) => REVIEW_ITEMS.includes(c)) ? "review" : "info";

/** Filings on EDGAR after the newest filing a report read, with 8-K item codes in words. */
export async function filingsSince(report: Report): Promise<NewFiling[]> {
  const read = report.sources.filter((s) => s.sourceType !== "News");
  const newest = read.map((s) => s.date).sort().at(-1);
  if (!newest) return [];
  const known = new Set(read.map((s) => s.id));
  const submissions = await getSubmissions(report.graph.company.cik);
  return submissions.filings
    .filter((f) => FORMS.has(f.form) && f.filingDate > newest && !known.has(f.accession))
    .slice(0, 8)
    .map((f) => ({
      id: f.accession,
      sourceType: f.form as "10-K" | "10-Q" | "8-K",
      title: `${f.form} filed ${f.filingDate}`,
      date: f.filingDate,
      url: filingDocumentUrl(f),
      items: f.form === "8-K" ? f.items : undefined,
      meaning: f.form === "8-K" ? describeItems(f.items) : undefined,
    }));
}

function metric(report: Report, key: string): string | null {
  const display = report.capital?.metrics.find((m) => m.key === key)?.display;
  return display && display !== "Not available" ? display : null;
}

/** A watch item can be checked once a periodic filing has arrived, or once the date it names has passed. */
function watchItems(report: Report, newFilings: NewFiling[], today: string): WatchItemStatus[] {
  const periodicArrived = newFilings.some((f) => f.sourceType === "10-Q" || f.sourceType === "10-K");
  return (report.devil?.watchList ?? []).map((w) => {
    const date = w.when.match(/\b(20\d\d-\d\d-\d\d)\b/)?.[1];
    const byFiling = /10-Q|10-K|quarter|filing|report/i.test(w.when) && periodicArrived;
    return { ...w, status: (date && date <= today) || byFiling ? "due" : "pending" };
  });
}

function unanalyzed(ticker: string, name: string | null): WatchCard {
  return {
    ticker,
    name,
    reportId: null,
    generatedAt: null,
    status: "unanalyzed",
    reasons: [],
    quarter: null,
    basedOn: null,
    memoStance: null,
    strongPoints: 0,
    moderatePoints: 0,
    entityCount: 0,
    highSeverity: [],
    totalDebt: null,
    liquidity: null,
    ebitda: null,
    return90d: null,
    benchmarkReturn90d: null,
    cash: [],
    lastFcf: null,
    runwayQuarters: null,
    nextMaturity: null,
    newFilings: [],
    watchItems: [],
    changeCounts: null,
  };
}

export async function watchCard(ticker: string, today = toIsoDate(new Date())): Promise<{ card: WatchCard; feed: FeedEvent[] }> {
  const report = await findLatestReport(ticker);
  if (!report) {
    const lookup = await lookupCik(ticker).catch(() => null);
    return { card: unanalyzed(ticker, lookup?.title ?? null), feed: [] };
  }
  const capital = report.capital ?? null;
  const [newFilings, book] = await Promise.all([filingsSince(report).catch(() => []), fetchFacts(report.graph.company.cik).catch(() => null)]);
  const through = capital?.asOf ?? today;
  const cash = book ? instantSeries(book, CASH, through, 8) : [];
  const ocf = book ? quarterlySeries(book, OPERATING_CASH, through, 2) : [];
  const capex = book ? quarterlySeries(book, CAPEX, through, 2) : [];
  const lastOcf = ocf.at(-1);
  const lastCapex = capex.find((c) => c.end === lastOcf?.end);
  const lastFcf = lastOcf && lastCapex ? lastOcf.value - lastCapex.value : null;
  const lastCash = cash.at(-1)?.value ?? null;
  const runwayQuarters = lastFcf !== null && lastFcf < 0 && lastCash !== null ? lastCash / -lastFcf : null;
  const quarter = report.sources.filter((s) => s.sourceType === "10-Q" || s.sourceType === "10-K").sort((a, b) => b.date.localeCompare(a.date))[0];

  const reasons: WatchReason[] = [];
  for (const f of newFilings) {
    if (f.sourceType === "8-K") {
      const tone = toneOfItems(f.items ?? "");
      if (tone !== "info") reasons.push({ tone, text: `8-K: ${f.meaning}`, date: f.date, url: f.url });
    } else {
      reasons.push({ tone: "review", text: `New ${f.sourceType} since the report: re-read the filings`, date: f.date, url: f.url });
    }
  }
  if (runwayQuarters !== null) {
    const text = `Cash covers about ${runwayQuarters.toFixed(1)} quarters of the latest burn (${money(lastFcf ?? 0)} free cash flow in the quarter to ${ocf.at(-1)?.end})`;
    if (runwayQuarters < 4) reasons.push({ tone: "act", text, date: ocf.at(-1)?.end });
    else if (runwayQuarters < 8) reasons.push({ tone: "review", text, date: ocf.at(-1)?.end });
  }
  const dated = (capital?.instruments ?? []).filter((i) => i.maturity && /^\d{4}-\d{2}-\d{2}$/.test(i.maturity) && i.maturity >= today);
  const within = (days: number) => dated.filter((i) => daysBetween(today, i.maturity as string) <= days);
  const dueYear = within(365).reduce((s, i) => s + (i.outstanding ?? 0), 0);
  if (dueYear > 0 && lastCash !== null && dueYear > lastCash) {
    reasons.push({ tone: "act", text: `${money(dueYear)} of debt due within 12 months exceeds cash of ${money(lastCash)}`, url: capital?.sourceUrl });
  } else {
    for (const i of within(730)) {
      reasons.push({ tone: "review", text: `${i.name} due${i.outstanding ? `: ${money(i.outstanding)}` : ""}`, date: i.maturity, url: capital?.sourceUrl });
    }
  }
  const sections = report.devil?.sections ?? [];
  const strongPoints = sections.filter((s) => s.strength === "strong").length;
  const moderatePoints = sections.filter((s) => s.strength === "moderate").length;
  const stance = report.devil?.memoStance ?? null;
  if ((stance === "STABLE" || stance === "CAUTION") && strongPoints >= 3) {
    reasons.push({ tone: "review", text: `The memo reads ${stance === "STABLE" ? "Stable" : "Caution"}; the Devil's Advocate makes ${strongPoints} strong points against it` });
  }
  const r90 = report.market?.return90d ?? null;
  const b90 = report.market?.benchmarkReturn90d ?? null;
  if (r90 !== null && r90 <= -0.2 && (b90 === null || r90 - b90 <= -0.15)) {
    reasons.push({
      tone: "review",
      text: `Stock ${(r90 * 100).toFixed(1)}% over 90 days${b90 !== null ? ` against the S&P 500 ${b90 >= 0 ? "+" : ""}${(b90 * 100).toFixed(1)}%` : ""}`,
      date: report.market?.priceDate,
    });
  }
  const [prevCash, nowCash] = cash.slice(-2);
  if (prevCash && nowCash && prevCash.value > 0 && nowCash.value / prevCash.value - 1 < -0.25) {
    reasons.push({ tone: "review", text: `Cash fell ${((1 - nowCash.value / prevCash.value) * 100).toFixed(0)}% in the quarter to ${nowCash.end}`, date: nowCash.end });
  }
  const items = watchItems(report, newFilings, today);
  const due = items.filter((w) => w.status === "due").length;
  if (due) reasons.push({ tone: "review", text: `${due} watch item${due === 1 ? "" : "s"} from the Devil's Advocate can be checked now` });

  const status: WatchStatus = reasons.some((r) => r.tone === "act") ? "act" : reasons.length ? "review" : "quiet";
  const next = dated.sort((a, b) => (a.maturity as string).localeCompare(b.maturity as string))[0];

  // The feed: new filings from EDGAR, then dated events behind the Devil's Advocate case.
  const feed: FeedEvent[] = newFilings.map((f) => ({
    ticker,
    date: f.date,
    kind: f.sourceType === "8-K" ? "8-K" : "filing",
    text: f.sourceType === "8-K" ? `8-K: ${f.meaning}` : `${f.sourceType} filed`,
    url: f.url,
    tone: f.sourceType === "8-K" ? toneOfItems(f.items ?? "") : "review",
  }));
  const seen = new Set(feed.map((e) => e.url));
  const newDates = new Set(newFilings.map((f) => `${f.sourceType}|${f.date}`));
  for (const e of report.devil?.events ?? []) {
    if (e.url && seen.has(e.url)) continue;
    // A bare "8-K filed" line repeats the 8-K described by its item codes.
    if (e.kind === "8-K" && (!e.text.includes(":") || newDates.has(`8-K|${e.date}`))) continue;
    const past = e.date <= today && daysBetween(e.date, today) <= FEED_PAST_DAYS && (e.kind === "8-K" || e.kind === "insider" || e.kind === "filing");
    const ahead = e.kind === "maturity" && e.date > today && e.date <= addDays(today, FEED_AHEAD_DAYS);
    if (!past && !ahead) continue;
    feed.push({
      ticker,
      date: e.date,
      kind: e.kind === "insider" ? "insider" : e.kind === "maturity" ? "maturity" : e.kind === "8-K" ? "8-K" : "filing",
      text: e.text,
      url: e.url ?? null,
      tone: e.kind === "maturity" ? "review" : e.kind === "insider" && /\bsold\b/.test(e.text) ? "review" : "info",
    });
  }

  const facts = report.changes?.changes.filter((c) => !c.judgment) ?? null;
  feed.splice(0, feed.length, ...groupTrades(feed));
  const entities = report.graph.nodes.filter((n) => !n.isCentral && n.change?.kind !== "removed");
  return {
    card: {
      ticker,
      name: report.graph.company.name,
      reportId: report.id,
      generatedAt: report.generatedAt,
      status,
      reasons: reasons.sort((a, b) => Number(b.tone === "act") - Number(a.tone === "act")),
      quarter: quarter?.fiscalPeriod ?? capital?.fiscalPeriod ?? null,
      basedOn: quarter ? `${quarter.sourceType} filed ${quarter.date}` : null,
      memoStance: stance,
      strongPoints,
      moderatePoints,
      entityCount: entities.length,
      highSeverity: entities.filter((e) => e.severity === "high").map((e) => e.name),
      totalDebt: metric(report, "total_debt"),
      liquidity: metric(report, "liquidity"),
      ebitda: metric(report, "ebitda"),
      return90d: r90,
      benchmarkReturn90d: b90,
      cash,
      lastFcf,
      runwayQuarters,
      nextMaturity: next ? { date: next.maturity as string, text: `${next.name}${next.outstanding ? `, ${money(next.outstanding)}` : ""}` } : null,
      newFilings,
      watchItems: items,
      changeCounts: facts
        ? {
            new: facts.filter((c) => c.kind === "new" || c.kind === "new_debt").length,
            changed: facts.filter((c) => c.kind === "magnitude" || c.kind === "debt_amount").length,
            removed: facts.filter((c) => c.kind === "removed" || c.kind === "repaid_debt").length,
          }
        : null,
    },
    feed,
  };
}

/** One line per insider per day: "Cook Timothy D sold 192,353 shares in 4 trades". */
function groupTrades(events: FeedEvent[]): FeedEvent[] {
  const out: FeedEvent[] = [];
  const groups = new Map<string, { event: FeedEvent; shares: number; count: number; who: string; verb: string }>();
  for (const e of events) {
    const m = e.kind === "insider" ? e.text.match(/^(.+?) (sold|bought) ([\d,]+) shares/) : null;
    if (!m) {
      out.push(e);
      continue;
    }
    const key = `${e.ticker}|${e.date}|${m[1]}|${m[2]}`;
    const shares = Number(m[3].replace(/,/g, ""));
    const g = groups.get(key);
    if (g) {
      g.shares += shares;
      g.count += 1;
    } else {
      const group = { event: { ...e }, shares, count: 1, who: m[1], verb: m[2] };
      groups.set(key, group);
      out.push(group.event);
    }
  }
  for (const g of groups.values()) {
    if (g.count > 1) g.event.text = `${g.who} ${g.verb} ${g.shares.toLocaleString("en-US")} shares in ${g.count} trades`;
  }
  return out;
}

const ORDER: Record<WatchStatus, number> = { act: 0, review: 1, quiet: 2, unanalyzed: 3 };

/** Every watched company in queue order, and one feed across them. */
export async function buildWatchlist(tickers: string[]) {
  const results = await Promise.all(tickers.map((t) => watchCard(t)));
  const cards = results
    .map((r) => r.card)
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.reasons.length - a.reasons.length || a.ticker.localeCompare(b.ticker));
  // At most five insider lines per company, so one active name does not drown the others.
  const insiders = new Map<string, number>();
  const feed = results
    .flatMap((r) => r.feed)
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((e) => {
      if (e.kind !== "insider") return true;
      const n = (insiders.get(e.ticker) ?? 0) + 1;
      insiders.set(e.ticker, n);
      return n <= MAX_INSIDER_LINES;
    });
  return { cards, feed, checkedAt: new Date().toISOString() };
}
