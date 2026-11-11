import type { ContagionCompany, LmeEvent, LmeEventKind, LmeScan, SponsorLink } from "@/types";
import { fullTextSearch, getSubmissions, globalFullTextSearch, hitUrl, htmlToText, secFetch, type GlobalHit } from "../edgar";
import { fetchFacts, instantAt, latestInstantDate, type FactBook } from "../xbrl";
import { scoreDistress } from "../distress";
import { locateQuote } from "../quotes";
import { daysBetween } from "../dates";
import { sameCompany, sponsorsNamed } from "./match";
import { SEARCH_NAME, SPONSORS } from "./sponsors";

/**
 * Builds the sponsor graph from EDGAR. Code does all of it: the sponsor comes
 * from the "Sponsor" definition in the company's own credit agreement or
 * indenture, events from its 8-Ks, figures from its XBRL. Nothing here is
 * read by a model.
 */

const SEARCH_FROM = "2016-01-01";
const PAGES = 5;
const HITS_PER_COMPANY = 4;
/** A company with no 10-K or 10-Q in this long has gone private, been sold or stopped reporting. */
const ACTIVE_DAYS = 460;

/** Blank-check companies and the sponsors' own funds, lenders and REITs also define "Sponsor". */
const NOT_PORTFOLIO = /Acquisition|Growth Capital|Blank Check|\bSPAC\b|Merger Corp|Opportunit(?:y|ies) Corp|Lending|Finance Trust|BDC|Conglomerate|Private Credit|Private Equity|Infrastructure Corp|Real Estate Income|Strategic|Pace |Advantage Corp|Portman Ridge|Investment Corp/i;
const SPAC_DEFINITION = /Sponsor,?\s+(?:Series\s+)?LLC|Sponsor LP|Pace |blank check|business combination/i;
/** A minority investment (preferred stock, a PIPE) names its investors the same way a buyout names its sponsor. */
const MINORITY_DOCUMENT = /INVESTMENT AGREEMENT|SUBSCRIPTION AGREEMENT|PREFERRED STOCK|SERIES [A-Z] (?:CONVERTIBLE )?PREFERRED|STOCKHOLDERS AGREEMENT.{0,200}PREFERRED/i;

export interface Candidate {
  cik: string;
  name: string;
  ticker: string | null;
  hits: GlobalHit[];
}

function parseDisplay(display: string): { name: string; ticker: string | null } {
  const name = display.replace(/\s*\(CIK \d+\)\s*$/, "").replace(/\s*\([A-Z0-9., -]+\)\s*$/, "").trim();
  const ticker = display.match(/\(([A-Z]{1,5})(?:[, ][^)]*)?\)\s*\(CIK/)?.[1] ?? null;
  return { name, ticker };
}

/** Companies whose credit documents define a sponsor by name, from EDGAR full-text search. */
export async function findCandidates(today: string, trace: (t: string) => void = () => {}): Promise<Map<string, Candidate>> {
  const out = new Map<string, Candidate>();
  for (const sponsor of SPONSORS) {
    const name = SEARCH_NAME[sponsor.id];
    let kept = 0;
    for (const query of [`"Sponsor" means "${name}"`, `"Sponsors" means "${name}"`]) {
      for (let page = 0; page < PAGES; page++) {
        const { total, hits } = await globalFullTextSearch(query, SEARCH_FROM, today, page).catch(() => ({ total: 0, hits: [] as GlobalHit[] }));
        for (const h of hits) {
          if (!/^EX-(4|10)/.test(h.fileType) || !h.cik || h.cik === "0") continue;
          const { name: company, ticker } = parseDisplay(h.displayName);
          if (NOT_PORTFOLIO.test(company) || sponsor.aliases.some((a) => company.toUpperCase().startsWith(a.toUpperCase()))) continue;
          const c = out.get(h.cik) ?? { cik: h.cik, name: company, ticker, hits: [] };
          c.ticker ??= ticker;
          if (!c.hits.some((x) => x.id === h.id)) c.hits.push(h);
          if (!out.has(h.cik)) kept++;
          out.set(h.cik, c);
        }
        if ((page + 1) * 100 >= total) break;
      }
    }
    trace(`${sponsor.name}: ${kept} companies found`);
  }
  return out;
}

/** Filings decoded as Latin-1 carry Windows curly quotes as control characters. */
export function fixQuotes(text: string): string {
  return text.replace(/\x93/g, "“").replace(/\x94/g, "”").replace(/[\x91\x92]/g, "’").replace(/\x96|\x97/g, "-");
}

const TERM = String.raw`[“"]\s*(?:[A-Z][A-Za-z&]*\s+){0,3}(?:Sponsors?|Sponsor Group|Permitted Holders?|Investors?)\s*[”"]\s+(?:shall\s+)?means?\b`;
const NEXT_TERM = /[“"]\s*[A-Z][^”"]{1,80}[”"]\s+(?:shall\s+)?(?:means?|has the meaning|shall have)/;

/** The sponsor definitions in a document ("Sponsor", "Bain Sponsors", "Permitted Holders"), each cut at the next defined term. */
export function sponsorDefinitions(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(new RegExp(TERM, "g"))) {
    const start = m.index ?? 0;
    const rest = text.slice(start + m[0].length, start + 1_600);
    const next = rest.search(NEXT_TERM);
    const body = next > 0 ? rest.slice(0, next) : rest.slice(0, 700);
    out.push(`${m[0]} ${body}`.replace(/\s+/g, " ").replace(/“\s+/g, "“").replace(/\s+”/g, "”").trim().slice(0, 700));
  }
  return out;
}

/** "JPMorgan Chase Bank, N.A., as Administrative Agent" on a credit agreement's cover. */
export function administrativeAgent(text: string): { name: string; quote: string } | null {
  const head = text.slice(0, 12_000);
  const m = head.match(/([A-Z][A-Za-z0-9.,&'’\- ]{3,90}?),?\s+as\s+(?:the\s+)?Administrative Agent/);
  if (!m) return null;
  const name = m[1]
    .replace(/^(?:and|AND|the|THE)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (name.length < 4 || /^(?:Agent|Lenders?|Borrower|Issuing)/i.test(name)) return null;
  return { name, quote: m[0].replace(/\s+/g, " ").trim() };
}

export interface Resolved {
  links: SponsorLink[];
  agent: ContagionCompany["agent"];
}

/** Reads the company's newest matching exhibits for the sponsor definition and the agent. */
export async function resolveCandidate(c: Candidate): Promise<Resolved> {
  const links: SponsorLink[] = [];
  let agent: ContagionCompany["agent"] = null;
  const hits = c.hits.sort((a, b) => b.filed.localeCompare(a.filed)).slice(0, HITS_PER_COMPANY);
  for (const hit of hits) {
    const url = hitUrl(c.cik, hit);
    const text = await secFetch(url)
      .then((h) => fixQuotes(htmlToText(h)))
      .catch(() => "");
    if (!text) continue;
    const minority = MINORITY_DOCUMENT.test(text.slice(0, 3_000));
    for (const def of minority ? [] : sponsorDefinitions(text)) {
      // Preferred and co-investors hold a stake without control.
      if (SPAC_DEFINITION.test(def) || /^“(?:Preferred|Other|Co-?Invest|Minority|Additional)/i.test(def) || !locateQuote(def.slice(0, 300), text)) continue;
      for (const s of sponsorsNamed(def)) {
        if (!links.some((l) => l.sponsorId === s.id)) links.push({ sponsorId: s.id, quote: def, documentUrl: url, filed: hit.filed });
      }
    }
    if (!agent && /CREDIT AGREEMENT|LOAN AGREEMENT|CREDIT AND GUARANTY/i.test(text.slice(0, 3_000))) {
      const a = administrativeAgent(text);
      if (a) agent = { ...a, url };
    }
  }
  return { links, agent };
}

const DEBT = ["LongTermDebt", "DebtLongtermAndShorttermCombinedAmount", "DebtInstrumentCarryingAmount", "LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations", "SeniorLongTermNotes"];
const DUE_12 = ["LongTermDebtMaturitiesRepaymentsOfPrincipalInNextTwelveMonths", "LongTermDebtMaturitiesRepaymentsOfPrincipalInNextRollingTwelveMonths"];
const DUE_24 = ["LongTermDebtMaturitiesRepaymentsOfPrincipalInYearTwo", "LongTermDebtMaturitiesRepaymentsOfPrincipalInRollingYearTwo"];
const ASSETS = ["Assets"];

/** Distress score, total debt and the next two years of principal, all from XBRL. */
export function figures(book: FactBook, cik: string, today: string): Pick<ContagionCompany, "distress" | "debt" | "due"> {
  const d = scoreDistress(book, cik, today);
  const distress = d ? { probability: d.probability, band: d.band, periodEnd: d.periodEnd } : null;
  const end = latestInstantDate(book, ASSETS);
  const debtValue = end ? DEBT.map((c) => instantAt(book, cik, [c], end)).find((v) => v && v.value > 0) ?? null : null;
  const debt = debtValue && end ? { value: debtValue.value, asOf: end, url: debtValue.url } : null;
  const dueEnd = latestInstantDate(book, DUE_12);
  let due: ContagionCompany["due"] = null;
  if (dueEnd && daysBetween(dueEnd, today) < ACTIVE_DAYS) {
    const n12 = instantAt(book, cik, DUE_12, dueEnd);
    const y2 = instantAt(book, cik, DUE_24, dueEnd);
    if (n12 || y2) due = { next12: n12?.value ?? null, year2: y2?.value ?? null, asOf: dueEnd, url: (n12 ?? y2)?.url ?? "" };
  }
  return { distress, debt, due };
}

const EVENT_TERMS: { re: RegExp; term: string; kind: LmeEventKind }[] = [
  { re: /transaction support agreement/i, term: "transaction support agreement", kind: "lme" },
  { re: /up-?tier/i, term: "uptier", kind: "lme" },
  { re: /drop-?down transaction/i, term: "drop-down", kind: "lme" },
  { re: /\bIPCo\b/, term: "IPCo", kind: "lme" },
  { re: /liability management (?:transaction|exercise)/i, term: "liability management", kind: "lme" },
  { re: /restructuring support agreement/i, term: "restructuring support agreement", kind: "restructuring" },
];
const DEBT_WORDS = /notes|loans?|lenders|holders|credit|indebtedness|exchange|financing|debt/i;
/** A deal, not a definition: the sentence describes a transaction the company entered into. */
const DEAL_WORDS = /entered into|exchange|transaction|consummat|launch|commence|agreed|priming|super-?priority/i;
/** Merger and SPAC support agreements use the same words. */
const NOT_LME = /Business Combination|merger agreement|Merger Sub|SPAC|sponsor support|voting and support/i;
const EVENT_QUERY = '"transaction support agreement" OR "uptier" OR "up-tier" OR "drop-down transaction" OR "non-pro rata" OR "IPCo" OR "liability management transaction" OR "restructuring support agreement"';
/** Events closer together than this are the same episode. */
const EPISODE_DAYS = 120;

/** Drops the exhibit header EDGAR puts before a press release: "EX-99.1 4 d936049dex991.htm EX-99.1 Exhibit 99.1". */
export function cleanQuote(quote: string): string {
  return quote.replace(/^(?:EX-[\d.A-Z]+\s+\d+\s+\S+\.htm\s+)?(?:EX-[\d.A-Z]+\s+)?Exhibit\s+[\d.]+\s+/i, "").replace(/^[¨☐☒]\s*/, "");
}

/** The sentence holding position at, trimmed to about 400 characters around it. */
function sentenceAround(text: string, at: number): string {
  let s = at;
  while (s > 0 && at - s < 220 && !/[.!?]\s/.test(text.slice(s - 2, s))) s--;
  let e = at;
  while (e < text.length && e - at < 260 && !/[.!?]\s/.test(text.slice(e - 1, e + 1))) e++;
  return cleanQuote(text.slice(s, e).replace(/\s+/g, " ").trim());
}

/** Bankruptcy filings (8-K Item 1.03) and liability management deals named in the company's 8-Ks. */
export async function findEvents(cik: string, today: string): Promise<{ events: LmeEvent[]; lastPeriodic: string | null; name?: string }> {
  const events: LmeEvent[] = [];
  const subs = await getSubmissions(cik).catch(() => null);
  const lastPeriodic = subs?.filings.find((f) => /^10-[KQ]/.test(f.form))?.filingDate ?? null;
  // Oldest first, so an episode is dated by its first filing.
  for (const f of [...(subs?.filings ?? [])].reverse()) {
    if (!/^8-K/.test(f.form) || !/\b1\.03\b/.test(f.items ?? "") || f.filingDate < SEARCH_FROM) continue;
    const url = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${f.accession.replace(/-/g, "")}/${f.primaryDocument}`;
    const text = await secFetch(url)
      .then((h) => fixQuotes(htmlToText(h)))
      .catch(() => "");
    // The sentence that says what was filed, not the cover page's list of item checkboxes.
    const at = [/filed voluntary petitions?/i, /voluntary petitions?/i, /Chapter 11/i].map((re) => text.search(re)).find((i) => i >= 0) ?? -1;
    // The item code alone is not enough: an acquisition 8-K can carry it by mistake.
    if (at < 0) continue;
    // A bankruptcy is one episode from petition to emergence.
    if (events.some((e) => e.kind === "bankruptcy" && Math.abs(daysBetween(e.date, f.filingDate)) < 730)) continue;
    events.push({ id: `${cik}:${f.accession}:1.03`, cik, date: f.filingDate, kind: "bankruptcy", term: "Item 1.03", quote: sentenceAround(text, at), url });
  }

  const hits = await fullTextSearch(cik, EVENT_QUERY, SEARCH_FROM, today).catch(() => []);
  const eightKs = hits.filter((h) => /^8-K/.test(h.form) && (/^8-K/.test(h.fileType) || /^EX-99/.test(h.fileType))).sort((a, b) => a.filed.localeCompare(b.filed));
  for (const h of eightKs) {
    const url = hitUrl(cik, h);
    const text = await secFetch(url)
      .then((h) => fixQuotes(htmlToText(h)))
      .catch(() => "");
    for (const t of EVENT_TERMS) {
      const m = t.re.exec(text);
      if (!m) continue;
      const quote = sentenceAround(text, m.index);
      if (!t.re.test(quote) || !DEBT_WORDS.test(quote) || !DEAL_WORDS.test(quote) || NOT_LME.test(text.slice(Math.max(0, m.index - 3_000), m.index + 3_000)) || !locateQuote(quote.slice(0, 300), text)) continue;
      // A support agreement signed for a Chapter 11 filing is part of the bankruptcy, not a deal of its own.
      if (events.some((e) => e.kind === "bankruptcy" && Math.abs(daysBetween(e.date, h.filed)) < 45)) break;
      // One event per kind per episode: the first filing that names it.
      if (events.some((e) => e.kind === t.kind && Math.abs(daysBetween(e.date, h.filed)) < EPISODE_DAYS)) break;
      events.push({ id: `${cik}:${h.id}:${t.term}`, cik, date: h.filed, kind: t.kind, term: t.term, quote, url });
      break;
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date));
  // The filer's current name: a SPAC that bought a company is still listed under the SPAC's name in old search hits.
  return { events, lastPeriodic, name: subs?.name };
}

export function isActive(lastPeriodic: string | null, today: string): boolean {
  return Boolean(lastPeriodic && daysBetween(lastPeriodic, today) <= ACTIVE_DAYS);
}

/** The trapdoor scan cut down to what the graph shows. */
export function summarizeScan(scan: LmeScan | null): ContagionCompany["lme"] {
  if (!scan) return null;
  return {
    verdicts: scan.verdicts.map((v) => ({ trapdoor: v.trapdoor, risk: v.risk })),
    open: scan.clauses
      .filter((c) => c.verified && c.status === "door_open" && c.quote)
      .slice(0, 6)
      .map((c) => ({ trapdoor: c.trapdoor, section: c.section, quote: c.quote as string, url: c.documentUrl })),
    documents: scan.documents.length,
    scannedAt: scan.scannedAt,
  };
}

/** Merges one company filed under two CIKs (a holding company and its old registrant): the live filer is kept, with both filers' sponsors and events. */
export function dedupe(companies: ContagionCompany[]): ContagionCompany[] {
  const out: ContagionCompany[] = [];
  for (const c of companies) {
    const i = out.findIndex((o) => o.cik !== c.cik && sameCompany(o.name, c.name) && (!o.ticker || !c.ticker || o.ticker === c.ticker));
    if (i < 0) {
      out.push(c);
      continue;
    }
    const [keep, drop] = c.active && !out[i].active ? [c, out[i]] : [out[i], c];
    const merged = { ...keep, ticker: keep.ticker ?? drop.ticker, sponsors: [...keep.sponsors], events: [...keep.events] };
    for (const l of drop.sponsors) if (!merged.sponsors.some((x) => x.sponsorId === l.sponsorId)) merged.sponsors.push(l);
    for (const e of drop.events) if (!merged.events.some((x) => x.id === e.id)) merged.events.push({ ...e, cik: merged.cik });
    merged.events.sort((x, y) => x.date.localeCompare(y.date));
    out[i] = merged;
  }
  return out;
}

export { fetchFacts };
