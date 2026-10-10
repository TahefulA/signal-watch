import { cachedFetchText } from "./fetch-cache";
import { toIsoDate } from "./dates";

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

function parseItems(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = match[1];
    const publisher = tag(block, "source");
    const rawTitle = tag(block, "title");
    const headline =
      publisher && rawTitle.endsWith(` - ${publisher}`) ? rawTitle.slice(0, -(publisher.length + 3)) : rawTitle;
    const published = new Date(tag(block, "pubDate"));
    if (Number.isNaN(published.getTime()) || !headline) continue;
    items.push({
      id: tag(block, "guid") || tag(block, "link"),
      date: toIsoDate(published),
      headline,
      publisher,
      url: tag(block, "link"),
      credibility: credibilityOf(publisher),
    });
  }
  return items;
}

/**
 * The most relevant recent headlines from Google News RSS, ranked by publisher
 * credibility and then recency, de-duplicated by headline.
 */
export async function fetchRecentNews(query: string, limit = 10, days = 45): Promise<NewsItem[]> {
  const q = encodeURIComponent(`${query} when:${days}d`);
  const xml = await cachedFetchText(`https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`, {
    throttleKey: "google-news",
    minIntervalMs: 500,
    maxAgeMs: 3 * 3_600_000,
    timeoutMs: 15_000,
  });
  const seen = new Set<string>();
  return parseItems(xml)
    .filter((item) => {
      const key = item.headline.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.credibility - a.credibility || b.date.localeCompare(a.date))
    .slice(0, limit);
}
