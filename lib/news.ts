import { cachedFetchText } from "./fetch-cache";
import { addDays, toIsoDate } from "./dates";

export interface NewsItem {
  id: string;
  date: string;
  headline: string;
  publisher: string;
  url: string;
  /** 0-1 weight; wire services and major financial press rank highest. */
  credibility: number;
}

const CREDIBILITY: { pattern: RegExp; weight: number }[] = [
  { pattern: /reuters|bloomberg|wall street journal|wsj|financial times|associated press|\bap news\b/i, weight: 1 },
  { pattern: /cnbc|barron|marketwatch|the information|axios|new york times|washington post|fortune|forbes/i, weight: 0.85 },
  { pattern: /yahoo finance|investopedia|business insider|seeking alpha|the motley fool|investor's business daily|benzinga|zacks|tipranks|thestreet/i, weight: 0.65 },
];

function credibilityOf(publisher: string): number {
  return CREDIBILITY.find((entry) => entry.pattern.test(publisher))?.weight ?? 0.45;
}

function decode(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function tag(block: string, name: string): string {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return match ? decode(match[1]) : "";
}

/**
 * Pulls headlines from Google News RSS in fixed date windows. Google caps each
 * response at 100 items, so windows keep coverage even across the full range.
 */
export async function fetchNews(query: string, startIso: string, endIso: string, windowDays = 15): Promise<NewsItem[]> {
  const items = new Map<string, NewsItem>();
  for (let from = startIso; from <= endIso; from = addDays(from, windowDays)) {
    const to = addDays(from, windowDays);
    const q = encodeURIComponent(`${query} after:${from} before:${to}`);
    const url = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
    const isRecent = to >= toIsoDate(new Date());
    const xml = await cachedFetchText(url, {
      throttleKey: "google-news",
      minIntervalMs: 1200,
      maxAgeMs: isRecent ? 6 * 3_600_000 : undefined,
    });
    for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const block = match[1];
      const publisher = tag(block, "source");
      const rawTitle = tag(block, "title");
      const headline = publisher && rawTitle.endsWith(` - ${publisher}`)
        ? rawTitle.slice(0, -(publisher.length + 3))
        : rawTitle;
      const published = new Date(tag(block, "pubDate"));
      if (Number.isNaN(published.getTime())) continue;
      const date = toIsoDate(published);
      if (date < startIso || date > endIso) continue;
      const id = tag(block, "guid") || tag(block, "link");
      const dedupeKey = headline.toLowerCase();
      if (!items.has(dedupeKey)) {
        items.set(dedupeKey, {
          id,
          date,
          headline,
          publisher,
          url: tag(block, "link"),
          credibility: credibilityOf(publisher),
        });
      }
    }
  }
  return Array.from(items.values()).sort((a, b) => a.date.localeCompare(b.date));
}
