import type { ComponentKey, SignalEvent, TickerDataset } from "@/types";
import { COMPONENT_BY_KEY, COMPONENTS } from "./components";
import { addDays, dateRange, formatDate } from "./dates";
import { fetchFilingText, fetchInsiderTransactions, getSubmissions, lookupCik, type InsiderTransaction } from "./edgar";
import { classifyFilingTone, classifyHeadlines, geminiEnabled, summarize } from "./gemini";
import { headlinePolarity } from "./lexicon";
import { fetchPrices } from "./market";
import { fetchNews } from "./news";
import { computeSignalScore } from "./scoring";
import { type AnalyzedFiling, analyzeFiling, filingEvents } from "./signals/filing";
import { insiderEvents } from "./signals/insider";
import { marketEvents } from "./signals/market";
import { type ScoredNews, newsEvents, toneEvents } from "./signals/sentiment";
import type { UniverseEntry } from "./universe";

const TEXT_FORMS = new Set(["10-K", "10-Q", "8-K", "10-K/A", "10-Q/A"]);
const PERIODIC_FORMS = new Set(["10-K", "10-Q"]);

export interface BuildOptions {
  endDate: string;
  days: number;
  log?: (message: string) => void;
}

function companyName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\bInc\b\.?/i, "Inc.")
    .replace(/\bCo\b\.?$/i, "Co.")
    .replace(/&t\b/i, "&T");
}

async function scoreHeadlines(headlines: string[]): Promise<(-1 | 0 | 1)[]> {
  const lexicon = headlines.map(headlinePolarity);
  if (!geminiEnabled()) return lexicon;
  const result: (-1 | 0 | 1)[] = [];
  for (let i = 0; i < headlines.length; i += 80) {
    const batch = headlines.slice(i, i + 80);
    result.push(...((await classifyHeadlines(batch)) ?? lexicon.slice(i, i + 80)));
  }
  return result;
}

function reasonTemplate(dataset: Omit<TickerDataset, "reason" | "generated_at">): { text: string; facts: string } {
  const latest = dataset.scores.at(-1);
  if (!latest) return { text: "No score yet.", facts: "" };
  const top = COMPONENTS.map((c) => ({ c, contribution: latest[c.key] * c.weight }))
    .sort((a, b) => b.contribution - a.contribution)[0];
  if (top.contribution === 0) {
    return { text: "No active risk signals across filings, insiders, news or market data.", facts: "" };
  }
  const byId = new Map(dataset.events.map((e) => [e.id, e]));
  const driver = latest.drivers[top.c.key]
    .map((id) => byId.get(id))
    .filter((e): e is SignalEvent => e !== undefined)
    .sort((a, b) => Math.abs(b.score_impact) - Math.abs(a.score_impact))[0];
  const text = driver
    ? `${top.c.label} leads: ${driver.title.charAt(0).toLowerCase()}${driver.title.slice(1)} (${formatDate(driver.date)}).`
    : `${top.c.label} leads: ${latest.notes[top.c.key]}`;
  const facts = [
    `Ticker: ${dataset.profile.ticker} (${dataset.profile.name})`,
    `Risk score: ${latest.total_score} of 100`,
    ...COMPONENTS.map((c) => `${c.label}: ${latest[c.key]} of 100. ${latest.notes[c.key]}`),
    driver ? `Main driver on ${formatDate(driver.date)}: ${driver.title}. Source: ${driver.source_label}.` : "",
  ].join("\n");
  return { text, facts };
}

/** Builds a point-in-time dataset for one ticker from EDGAR, Google News and Yahoo Finance. */
export async function buildDataset(entry: UniverseEntry, options: BuildOptions): Promise<TickerDataset> {
  const log = options.log ?? (() => undefined);
  const windowStart = addDays(options.endDate, -(options.days - 1));
  const filingsFrom = addDays(windowStart, -120);

  const company = await lookupCik(entry.ticker);
  if (!company) throw new Error(`No CIK for ${entry.ticker}`);
  const submissions = await getSubmissions(company.cik);
  const profile = {
    ticker: entry.ticker,
    name: companyName(submissions.name),
    cik: company.cik,
    sector: entry.sector,
    sector_etf: entry.sector_etf,
  };

  // Text filings in range, plus the two periodic filings before it as a baseline.
  const inRange = submissions.filings.filter(
    (f) => TEXT_FORMS.has(f.form) && f.filingDate >= filingsFrom && f.filingDate <= options.endDate,
  );
  const baseline = submissions.filings
    .filter((f) => PERIODIC_FORMS.has(f.form) && f.filingDate < filingsFrom)
    .slice(0, 2);
  const textFilings = [...baseline, ...inRange];
  log(`${entry.ticker}: ${textFilings.length} text filings (${baseline.length} baseline)`);

  const analyzed: AnalyzedFiling[] = [];
  for (const ref of textFilings) {
    const documents = await fetchFilingText(ref);
    let tone: number | null = null;
    if (geminiEnabled() && PERIODIC_FORMS.has(ref.form)) {
      const draft = analyzeFiling(ref, documents, null);
      tone = await classifyFilingTone(draft.mdaSentences.join(" "));
    }
    analyzed.push(analyzeFiling(ref, documents, tone));
  }

  const form4s = submissions.filings.filter(
    (f) => f.form === "4" && f.filingDate >= addDays(windowStart, -400) && f.filingDate <= options.endDate,
  );
  log(`${entry.ticker}: ${form4s.length} Form 4 filings`);
  const transactions: InsiderTransaction[] = [];
  for (const ref of form4s) {
    try {
      transactions.push(...(await fetchInsiderTransactions(ref)));
    } catch (error) {
      log(`${entry.ticker}: skipped Form 4 ${ref.accession}: ${String(error)}`);
    }
  }

  const rawNews = await fetchNews(entry.news_query, addDays(windowStart, -14), options.endDate);
  const polarities = await scoreHeadlines(rawNews.map((n) => n.headline));
  const news: ScoredNews[] = rawNews.map((n, i) => ({ ...n, polarity: polarities[i] }));
  log(`${entry.ticker}: ${news.length} headlines`);

  const priceStart = addDays(windowStart, -60);
  const [stock, sector, highYield, investmentGrade] = await Promise.all([
    fetchPrices(entry.ticker, priceStart),
    fetchPrices(entry.sector_etf, priceStart),
    fetchPrices("HYG", priceStart),
    fetchPrices("LQD", priceStart),
  ]);
  const market = { ticker: entry.ticker, sectorEtf: entry.sector_etf, stock, sector, highYield, investmentGrade };

  const filingEventList = filingEvents(entry.ticker, analyzed, baseline.length);
  const insiderEventList = insiderEvents(entry.ticker, transactions, stock, addDays(windowStart, -30));
  const toneEventList = toneEvents(entry.ticker, analyzed, filingsFrom);
  const newsEventList = newsEvents(entry.ticker, news, addDays(windowStart, -14));
  const marketEventList = marketEvents(market, dateRange(addDays(windowStart, -10), options.endDate));

  const scores = dateRange(windowStart, options.endDate).map((date) =>
    computeSignalScore(date, {
      ticker: entry.ticker,
      filingEvents: filingEventList,
      insiderEvents: insiderEventList,
      sentiment: { filings: analyzed, news, toneEvents: toneEventList, newsEvents: newsEventList },
      market,
      marketEvents: marketEventList,
    }),
  );

  // Keep events in the window plus any older event still driving a score.
  const referenced = new Set(scores.flatMap((s) => Object.values(s.drivers).flat()));
  const events = [...filingEventList, ...insiderEventList, ...toneEventList, ...newsEventList, ...marketEventList]
    .filter((e) => referenced.has(e.id) || (e.date >= windowStart && e.date <= options.endDate))
    .sort((a, b) => a.date.localeCompare(b.date));

  const partial = { profile, scores, events };
  const { text, facts } = reasonTemplate(partial);
  const reason = facts ? await summarize(facts, text) : text;
  return { ...partial, reason, generated_at: new Date().toISOString() };
}

export function componentLabel(key: ComponentKey): string {
  return COMPONENT_BY_KEY[key].label;
}
