import type { SignalEvent } from "@/types";
import { addDays, formatDate } from "../dates";
import { documentTone } from "../lexicon";
import type { NewsItem } from "../news";
import type { AnalyzedFiling } from "./filing";
import { type ComponentDay, clampScore, makeEvent, round1 } from "./shared";

export const NEWS_WINDOW_DAYS = 14;
const MIN_HEADLINES = 3;
const BULLISH = 60;
const BEARISH = 40;

export interface ScoredNews extends NewsItem {
  polarity: -1 | 0 | 1;
}

function toneWord(tone: number): string {
  if (tone >= BULLISH) return "bullish";
  if (tone <= BEARISH) return "bearish";
  return "neutral";
}

export function newsEvents(ticker: string, news: ScoredNews[], windowStart: string): SignalEvent[] {
  const byDay = new Map<string, ScoredNews[]>();
  for (const item of news) {
    if (item.date < windowStart || item.polarity === 0 || item.credibility < 0.65) continue;
    byDay.set(item.date, [...(byDay.get(item.date) ?? []), item]);
  }
  const events: SignalEvent[] = [];
  for (const items of byDay.values()) {
    items
      .sort((a, b) => b.credibility - a.credibility)
      .slice(0, 2)
      .forEach((item) => {
        events.push(
          makeEvent({
            ticker,
            date: item.date,
            event_type: "news",
            category: item.polarity > 0 ? "news_positive" : "news_negative",
            component: "sentiment_divergence",
            title: `${item.polarity > 0 ? "Positive" : "Negative"} coverage from ${item.publisher || "the press"}`,
            quote: item.headline,
            quote_kind: "verbatim",
            source_label: `${item.publisher || "News"} headline, ${formatDate(item.date)}`,
            source_url: item.url,
            score_impact: round1(-item.polarity * item.credibility * 10),
          }),
        );
      });
  }
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

/** One event per periodic filing recording management tone, the other side of the divergence. */
export function toneEvents(ticker: string, filings: AnalyzedFiling[], since: string): SignalEvent[] {
  return filings
    .filter((f) => f.tone !== null && f.ref.filingDate >= since)
    .map((filing) => {
      const tone = filing.tone ?? 50;
      const ranked = filing.mdaSentences
        .map((text) => ({ text, tone: documentTone(text) }))
        .sort((a, b) => (tone >= 50 ? b.tone - a.tone : a.tone - b.tone));
      const quoteText = ranked[0]?.text ?? filing.mdaSentences[0] ?? "";
      const sentence = filing.sentences.find((s) => s.text === quoteText);
      return makeEvent({
        ticker,
        date: filing.ref.filingDate,
        event_type: "filing",
        category: "filing",
        component: "sentiment_divergence",
        title: `Management tone ${tone}/100 (${toneWord(tone)}) in ${filing.ref.form}`,
        quote: quoteText,
        quote_kind: "verbatim",
        source_label: `${sentence?.label ?? filing.ref.form}, filed ${formatDate(filing.ref.filingDate)}`,
        source_url: sentence?.url ?? filing.url,
        score_impact: 0,
      });
    });
}

export interface SentimentInputs {
  filings: AnalyzedFiling[];
  news: ScoredNews[];
  toneEvents: SignalEvent[];
  newsEvents: SignalEvent[];
}

export function sentimentComponent(date: string, inputs: SentimentInputs): ComponentDay {
  const latest = inputs.filings
    .filter((f) => f.tone !== null && f.ref.filingDate <= date)
    .sort((a, b) => b.ref.filingDate.localeCompare(a.ref.filingDate))[0];
  const from = addDays(date, -(NEWS_WINDOW_DAYS - 1));
  const window = inputs.news.filter((n) => n.date >= from && n.date <= date);

  if (!latest || latest.tone === null) {
    return { value: 0, drivers: [], note: "No periodic filing with a readable MD&A yet." };
  }
  const management = latest.tone;
  const toneEvent = inputs.toneEvents.find((e) => e.date === latest.ref.filingDate);
  if (window.length < MIN_HEADLINES) {
    return {
      value: 0,
      drivers: toneEvent ? [toneEvent.id] : [],
      note: `Management tone ${management}; too few headlines in the last ${NEWS_WINDOW_DAYS} days to compare.`,
    };
  }

  const weight = window.reduce((sum, n) => sum + n.credibility, 0);
  const newsTone = Math.round(50 + 50 * (window.reduce((sum, n) => sum + n.polarity * n.credibility, 0) / weight));

  let total = 0;
  if (management >= BULLISH && newsTone <= BEARISH) total += 50;
  if (management <= BEARISH && newsTone >= BULLISH) total += 30;
  if (Math.abs(management - newsTone) > 40) total += 20;

  const drivers = [
    ...(toneEvent ? [toneEvent.id] : []),
    ...inputs.newsEvents
      .filter((e) => e.date >= from && e.date <= date)
      .sort((a, b) => Math.abs(b.score_impact) - Math.abs(a.score_impact))
      .slice(0, 6)
      .map((e) => e.id),
  ];
  return {
    value: round1(clampScore(total)),
    drivers,
    note: `Management tone ${management} against news tone ${newsTone} across ${window.length} headlines.`,
  };
}
