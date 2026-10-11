import { cachedFetchText } from "./fetch-cache";

const USER_AGENT = process.env.SEC_USER_AGENT ?? "SignalWatch/1.0 (contact@signalwatch.xyz)";

/** SEC allows 10 requests per second; stay comfortably under it. */
const SEC_INTERVAL_MS = 125;

export type PeriodicForm = "10-K" | "10-Q";
export type TextForm = PeriodicForm | "8-K";

export interface FilingRef {
  cik: string;
  accession: string;
  form: string;
  filingDate: string;
  primaryDocument: string;
  items: string;
}

export interface CompanySubmissions {
  cik: string;
  name: string;
  sicDescription: string;
  filings: FilingRef[];
}

export interface DocumentText {
  url: string;
  text: string;
}

export interface InsiderTransaction {
  accession: string;
  filingDate: string;
  transactionDate: string;
  ownerName: string;
  ownerTitle: string;
  isOfficer: boolean;
  isDirector: boolean;
  /** P = open-market purchase, S = open-market sale. */
  code: "P" | "S";
  shares: number;
  price: number | null;
  sharesOwnedAfter: number;
  sourceUrl: string;
}

interface TickerMapEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

interface SubmissionsJson {
  name: string;
  sicDescription: string;
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      form: string[];
      primaryDocument: string[];
      items: string[];
    };
  };
}

interface IndexJson {
  directory: { item: { name: string; size: string }[] };
}

async function secFetch(url: string): Promise<string> {
  return cachedFetchText(url, {
    headers: { "User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate" },
    throttleKey: "sec",
    minIntervalMs: SEC_INTERVAL_MS,
    timeoutMs: 15_000,
  });
}

/** Submissions change daily, so they are cached for at most twelve hours. */
async function secFetchFresh(url: string): Promise<string> {
  return cachedFetchText(url, {
    headers: { "User-Agent": USER_AGENT },
    throttleKey: "sec",
    minIntervalMs: SEC_INTERVAL_MS,
    maxAgeMs: 12 * 3_600_000,
    timeoutMs: 15_000,
  });
}

export function padCik(cik: string | number): string {
  return String(cik).padStart(10, "0");
}

export async function lookupCik(ticker: string): Promise<{ cik: string; title: string } | null> {
  const raw = await secFetchFresh("https://www.sec.gov/files/company_tickers.json");
  const map = JSON.parse(raw) as Record<string, TickerMapEntry>;
  const match = Object.values(map).find((entry) => entry.ticker === ticker.toUpperCase());
  return match ? { cik: String(match.cik_str), title: match.title } : null;
}

export async function getSubmissions(cik: string): Promise<CompanySubmissions> {
  const raw = await secFetchFresh(`https://data.sec.gov/submissions/CIK${padCik(cik)}.json`);
  const json = JSON.parse(raw) as SubmissionsJson;
  const recent = json.filings.recent;
  const filings: FilingRef[] = recent.accessionNumber.map((accession, i) => ({
    cik,
    accession,
    form: recent.form[i],
    filingDate: recent.filingDate[i],
    primaryDocument: recent.primaryDocument[i],
    items: recent.items[i] ?? "",
  }));
  return { cik, name: json.name, sicDescription: json.sicDescription, filings };
}

function archiveBase(filing: FilingRef): string {
  return `https://www.sec.gov/Archives/edgar/data/${Number(filing.cik)}/${filing.accession.replace(/-/g, "")}`;
}

/** Human-readable link to the filing's main document on EDGAR. */
export function filingDocumentUrl(filing: FilingRef): string {
  return `${archiveBase(filing)}/${filing.primaryDocument}`;
}

export function filingIndexUrl(filing: FilingRef): string {
  return `${archiveBase(filing)}/${filing.accession}-index.htm`;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  mdash: "—",
  ndash: "–",
  bull: "•",
};

export function htmlToText(html: string): string {
  return html
    .replace(/<ix:header>[\s\S]*?<\/ix:header>/gi, " ")
    .replace(/<(script|style|head)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|tr|li|h\d|table|br)\s*>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match)
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

export async function fetchFilingText(filing: FilingRef): Promise<DocumentText[]> {
  const documents: DocumentText[] = [];
  const primaryUrl = filingDocumentUrl(filing);
  documents.push({ url: primaryUrl, text: htmlToText(await secFetch(primaryUrl)) });

  // 8-K substance usually lives in exhibits such as the press release.
  if (filing.form === "8-K") {
    const index = JSON.parse(await secFetch(`${archiveBase(filing)}/index.json`)) as IndexJson;
    const exhibits = index.directory.item
      .filter(
        (item) =>
          /\.htm$/i.test(item.name) &&
          item.name !== filing.primaryDocument &&
          !/^R\d+\.htm$/i.test(item.name) &&
          !/index/i.test(item.name) &&
          Number(item.size) > 0 &&
          Number(item.size) < 3_000_000,
      )
      .slice(0, 3);
    for (const exhibit of exhibits) {
      const url = `${archiveBase(filing)}/${exhibit.name}`;
      documents.push({ url, text: htmlToText(await secFetch(url)) });
    }
  }
  return documents;
}

/** Rejects table rows and slide fragments: too many digits or capitals, or no closing punctuation. */
function isProse(sentence: string): boolean {
  const letters = sentence.match(/[a-z]/gi)?.length ?? 0;
  const lower = sentence.match(/[a-z]/g)?.length ?? 0;
  const digits = sentence.match(/\d/g)?.length ?? 0;
  return (
    letters > 0 &&
    digits / sentence.length < 0.12 &&
    lower / letters > 0.6 &&
    /[.!?)\u201d"]$/.test(sentence) &&
    sentence.split(/\s+/).length >= 8
  );
}

/** Splits text into sentences suitable for quoting. */
export function splitSentences(text: string): string[] {
  return text
    .split(/\n|(?<=[.!?])\s+(?=[A-Z“"(])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 40 && sentence.length <= 700 && isProse(sentence));
}

export interface Section {
  label: string;
  text: string;
}

const SECTION_PATTERNS: { label: string; start: RegExp }[] = [
  { label: "Item 1. Business", start: /\n\s*Item\s*1\s*\.?\s*[\-\u2013\u2014:]?\s*Business\.?\s*\n/gi },
  { label: "Item 1A. Risk Factors", start: /\n\s*Item\s*1A\s*\.?\s*[\-–—:]?\s*Risk Factors\.?\s*\n/gi },
  {
    label: "Item 7. Management’s Discussion and Analysis",
    start: /\n\s*Item\s*7\.?\s*[\-–—:]?\s*Management.{1,3}s Discussion and Analysis[^\n]*\n/gi,
  },
  {
    label: "Item 2. Management’s Discussion and Analysis",
    start: /\n\s*Item\s*2\.?\s*[\-–—:]?\s*Management.{1,3}s Discussion and Analysis[^\n]*\n/gi,
  },
  { label: "Item 9A. Controls and Procedures", start: /\n\s*Item\s*9A\.?\s*[\-–—:]?\s*Controls and Procedures\s*\n/gi },
  { label: "Item 4. Controls and Procedures", start: /\n\s*Item\s*4\.?\s*[\-–—:]?\s*Controls and Procedures\s*\n/gi },
];

const ITEM_HEADING = /\n\s*Item\s*\d+[A-C]?\s*\.?\s*[\-–—:]?\s*[A-Z][^\n]{2,90}\n/gi;

/** Running page headers such as "Item 1 . Business (Continued)" repeat inside a section; they are not boundaries. */
const CONTINUED = /\(continued\)/i;

/**
 * Finds the body of each known section. The table of contents repeats every
 * heading, so the longest match for each heading is taken as the body.
 */
export function extractSections(text: string): Section[] {
  const headings = Array.from(text.matchAll(ITEM_HEADING))
    .filter((m) => !CONTINUED.test(m[0]))
    .map((m) => m.index ?? 0);
  const sections: Section[] = [];
  for (const { label, start } of SECTION_PATTERNS) {
    let best = "";
    for (const match of text.matchAll(start)) {
      const from = (match.index ?? 0) + match[0].length;
      const next = headings.find((h) => h > from + 50) ?? text.length;
      const body = text.slice(from, next).replace(/\n\s*Item\s*\d+[A-C]?\s*\.?[^\n]{0,90}\(continued\)\s*(?=\n)/gi, "");
      if (body.length > best.length) best = body;
    }
    if (best.length > 500) sections.push({ label, text: best });
  }
  return sections;
}

/** Labels which section of a filing a sentence came from. */
export function locateSentence(sentence: string, sections: Section[], form: string): string {
  const section = sections.find((s) => s.text.includes(sentence));
  return section ? `${form}, ${section.label}` : form;
}

function xmlValue(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}>\\s*(?:<value>)?\\s*([^<]*?)\\s*(?:</value>)?\\s*</${tag}>`, "i"));
  return match ? match[1].trim() : "";
}

function xmlNested(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? match[1] : "";
}

/** Parses open-market purchases and sales from a Form 4. Grants, exercises and tax withholding are ignored. */
export async function fetchInsiderTransactions(filing: FilingRef): Promise<InsiderTransaction[]> {
  const rawDocument = filing.primaryDocument.replace(/^xsl[^/]+\//, "");
  const xml = await secFetch(`${archiveBase(filing)}/${rawDocument}`);

  const owner = xmlNested(xml, "reportingOwner");
  const relationship = xmlNested(owner, "reportingOwnerRelationship");
  const ownerName = xmlValue(owner, "rptOwnerName");
  const isOfficer = /^(1|true)$/i.test(xmlValue(relationship, "isOfficer"));
  const isDirector = /^(1|true)$/i.test(xmlValue(relationship, "isDirector"));
  const ownerTitle = xmlValue(relationship, "officerTitle") || (isDirector ? "Director" : "");

  const transactions: InsiderTransaction[] = [];
  for (const match of xml.matchAll(/<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/gi)) {
    const block = match[1];
    const code = xmlValue(xmlNested(block, "transactionCoding"), "transactionCode");
    if (code !== "P" && code !== "S") continue;
    const amounts = xmlNested(block, "transactionAmounts");
    const shares = Number(xmlValue(amounts, "transactionShares"));
    const priceRaw = xmlValue(amounts, "transactionPricePerShare");
    const after = Number(xmlValue(xmlNested(block, "postTransactionAmounts"), "sharesOwnedFollowingTransaction"));
    if (!Number.isFinite(shares) || shares <= 0) continue;
    transactions.push({
      accession: filing.accession,
      filingDate: filing.filingDate,
      transactionDate: xmlValue(block, "transactionDate") || filing.filingDate,
      ownerName,
      ownerTitle,
      isOfficer,
      isDirector,
      code,
      shares,
      price: priceRaw && Number.isFinite(Number(priceRaw)) ? Number(priceRaw) : null,
      sharesOwnedAfter: Number.isFinite(after) ? after : 0,
      sourceUrl: filingDocumentUrl(filing),
    });
  }
  return transactions;
}

const FORM_PRIORITY = ["10-K", "10-Q", "8-K"] as const;

/** The latest 10-K, 10-Q and 8-K filed in the last two years, newest first. */
export function selectRecentFilings(submissions: CompanySubmissions, today: string): FilingRef[] {
  const cutoff = `${Number(today.slice(0, 4)) - 2}${today.slice(4)}`;
  const picks: FilingRef[] = [];
  for (const form of FORM_PRIORITY) {
    const latest = submissions.filings.find((f) => f.form === form && f.filingDate >= cutoff && f.filingDate <= today);
    if (latest) picks.push(latest);
  }
  return picks.sort((a, b) => b.filingDate.localeCompare(a.filingDate));
}

export interface FilingExcerpt {
  label: string;
  text: string;
  url: string;
}

const SECTION_BUDGET: Record<string, string[]> = {
  "10-K": ["Item 1. Business", "Item 1A. Risk Factors", "Item 7. Management"],
  "10-Q": ["Item 2. Management", "Item 1A. Risk Factors"],
};

/**
 * Cuts a filing down to the sections that carry counterparties and risks, within
 * a character budget. 8-Ks use the cover document and exhibits as filed.
 */
export function excerptFiling(filing: FilingRef, documents: DocumentText[], budget = 40_000): FilingExcerpt[] {
  const primary = documents[0];
  if (!primary) return [];
  const wanted = SECTION_BUDGET[filing.form];
  if (!wanted) {
    const share = Math.floor(budget / documents.length);
    return documents.map((doc, i) => ({
      label: i === 0 ? "Current report" : "Exhibit",
      text: withoutSafeHarbor(doc.text).slice(0, share),
      url: doc.url,
    }));
  }
  const sections = extractSections(primary.text);
  const chosen = wanted
    .map((prefix) => sections.find((s) => s.label.startsWith(prefix)))
    .filter((s): s is Section => s !== undefined);
  if (chosen.length === 0) return [{ label: filing.form, text: primary.text.slice(0, budget), url: primary.url }];
  const share = Math.floor(budget / chosen.length);
  return chosen.map((s) => ({ label: s.label, text: withCompetition(s.text, share), url: primary.url }));
}

const COMPETITION_HEADING = /\n\s*(?:Competition|Competitive (?:Landscape|Environment|Conditions))\s*\n/i;
const COMPETITION_BUDGET = 4_000;

/**
 * Cuts a section to its share, but keeps the "Competition" subsection of a
 * Business section even when it falls past the cut, since it names competitors.
 */
function withCompetition(text: string, share: number): string {
  if (text.length <= share) return text;
  const match = COMPETITION_HEADING.exec(text);
  if (!match || match.index + COMPETITION_BUDGET <= share) return text.slice(0, share);
  const competition = text.slice(match.index, match.index + COMPETITION_BUDGET);
  return `${text.slice(0, share - competition.length)}\n${competition}`;
}

const NOTE_HEADING = /\n\s*(?:NOTE|Note)\s*(\d{1,2})\.?\s*[\-–—:.]?\s*([^\n]{3,90})\n/g;
const DEBT_NOTE = /\b(debt|borrowings?|indebtedness|notes payable|credit (?:facility|facilities|agreement)|convertible (?:senior |promissory )?notes|senior notes|financing arrangements)\b/i;

/**
 * The financial-statement notes that describe debt, such as "NOTE 10 – DEBT" and
 * "NOTE 11 – CONVERTIBLE PROMISSORY NOTES". Each note runs to the next note heading.
 */
export function extractDebtNotes(text: string): Section[] {
  const headings = Array.from(text.matchAll(NOTE_HEADING)).map((m) => ({
    index: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
    number: m[1],
    title: m[2].trim(),
  }));
  const notes: Section[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    if (!DEBT_NOTE.test(h.title) || /fair value|income tax|lease/i.test(h.title)) continue;
    const next = headings.slice(i + 1).find((n) => n.number !== h.number);
    const body = text.slice(h.end, next ? next.index : text.length);
    // The table of contents and cross-references repeat headings; keep the longest body per note.
    if (body.length < 800) continue;
    const label = `Note ${h.number}. ${h.title.replace(/^[\-–—:.\s]+/, "")}`;
    if (seen.has(h.number)) {
      const existing = notes.find((n) => n.label.startsWith(`Note ${h.number}.`));
      if (existing && existing.text.length < body.length) existing.text = body;
      continue;
    }
    seen.add(h.number);
    notes.push({ label, text: body });
  }
  return notes;
}

const SAFE_HARBOR = /\n\s*(?:Forward[- ]Looking Statements|Cautionary (?:Note|Statement)[^\n]{0,80}|Safe Harbor[^\n]{0,80})\s*\n/i;

/**
 * Drops the forward-looking statements disclaimer at the end of a press release.
 * It lists every conceivable risk in boilerplate, which is not a disclosure that
 * something is happening.
 */
export function withoutSafeHarbor(text: string): string {
  const match = SAFE_HARBOR.exec(text);
  return match && match.index > text.length * 0.3 ? text.slice(0, match.index) : text;
}

/** The primary document's raw HTML, which carries the inline XBRL tags. */
export async function fetchFilingHtml(filing: FilingRef): Promise<string> {
  return secFetch(filingDocumentUrl(filing));
}
