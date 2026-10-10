import type { XbrlValue } from "@/types";
import { cachedFetchText } from "./fetch-cache";
import { daysBetween } from "./dates";
import { padCik } from "./edgar";

/**
 * Reported financial figures from SEC XBRL company facts. These are the numbers
 * as tagged in the company's own 10-K and 10-Q filings.
 */

const USER_AGENT = process.env.SEC_USER_AGENT ?? "SignalWatch/1.0 (contact@signalwatch.xyz)";

interface Fact {
  start?: string;
  end: string;
  val: number;
  accn: string;
  form: string;
  filed: string;
}

interface CompanyFacts {
  facts: Record<string, Record<string, { units: Record<string, Fact[]> }>>;
}

export type FactBook = Map<string, Fact[]>;

export async function fetchFacts(cik: string): Promise<FactBook> {
  const raw = await cachedFetchText(`https://data.sec.gov/api/xbrl/companyfacts/CIK${padCik(cik)}.json`, {
    headers: { "User-Agent": USER_AGENT },
    throttleKey: "sec",
    minIntervalMs: 125,
    maxAgeMs: 12 * 3_600_000,
    timeoutMs: 20_000,
  });
  const json = JSON.parse(raw) as CompanyFacts;
  const book: FactBook = new Map();
  for (const [concept, entry] of Object.entries(json.facts["us-gaap"] ?? {})) {
    const usd = entry.units.USD;
    if (usd) book.set(concept, usd.filter((f) => f.form === "10-K" || f.form === "10-Q" || f.form === "10-K/A" || f.form === "10-Q/A"));
  }
  return book;
}

function filingUrl(cik: string, accn: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accn.replace(/-/g, "")}/${accn}-index.htm`;
}

function toValue(cik: string, concept: string, fact: Fact, period: string, value = fact.val): XbrlValue {
  return { concept, value, period, form: fact.form, filed: fact.filed, url: filingUrl(cik, fact.accn) };
}

/** Latest-filed fact for each (start, end) period. Later filings restate earlier ones. */
function latestByPeriod(facts: Fact[]): Fact[] {
  const map = new Map<string, Fact>();
  for (const f of facts) {
    const key = `${f.start ?? ""}|${f.end}`;
    const existing = map.get(key);
    if (!existing || f.filed > existing.filed) map.set(key, f);
  }
  return Array.from(map.values());
}

/** Balance sheet value at a date, from the first concept that reports it. */
export function instantAt(book: FactBook, cik: string, concepts: string[], date: string): XbrlValue | null {
  for (const concept of concepts) {
    const fact = latestByPeriod(book.get(concept) ?? []).find((f) => !f.start && f.end === date);
    if (fact) return toValue(cik, concept, fact, `As of ${date}`);
  }
  return null;
}

/** The most recent balance sheet date among the given concepts. */
export function latestInstantDate(book: FactBook, concepts: string[]): string | null {
  let latest: string | null = null;
  for (const concept of concepts) {
    for (const f of book.get(concept) ?? []) if (!f.start && (!latest || f.end > latest)) latest = f.end;
  }
  return latest;
}

function months(f: Fact): number {
  return f.start ? daysBetween(f.start, f.end) / 30.44 : 0;
}

function near(a: string, b: string, days = 10): boolean {
  return Math.abs(daysBetween(a, b)) <= days;
}

function shiftYear(iso: string, years: number): string {
  return `${Number(iso.slice(0, 4)) + years}${iso.slice(4)}`;
}

/**
 * Trailing twelve months ending on a date. Uses a fiscal-year figure when the
 * date is a fiscal year end; otherwise last fiscal year plus this year to date
 * minus the same period a year earlier.
 */
export function trailingTwelveMonths(book: FactBook, cik: string, concepts: string[], end: string): XbrlValue | null {
  const period = `12 months ended ${end}`;
  for (const concept of concepts) {
    const facts = latestByPeriod(book.get(concept) ?? []).filter((f) => f.start);
    const annual = facts.find((f) => f.end === end && months(f) > 11 && months(f) < 13);
    if (annual) return toValue(cik, concept, annual, period);

    const ytd = facts
      .filter((f) => f.end === end && months(f) < 11)
      .sort((a, b) => months(b) - months(a))[0];
    if (!ytd?.start) continue;
    const fiscalYear = facts.find((f) => months(f) > 11 && months(f) < 13 && near(f.end, ytd.start ?? "", 5) && f.end < (ytd.start ?? ""));
    const priorYtd = facts.find(
      (f) => f.start && near(f.start, shiftYear(ytd.start ?? "", -1)) && near(f.end, shiftYear(end, -1)) && months(f) < 11,
    );
    if (fiscalYear && priorYtd) {
      return toValue(cik, concept, ytd, period, fiscalYear.val + ytd.val - priorYtd.val);
    }
  }
  return null;
}
