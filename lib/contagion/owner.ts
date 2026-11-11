import type { ContagionCompany, ContagionMap, FamilyMember, LmeScan, OwnerView } from "@/types";
import { fullTextSearch, getSubmissions, type SearchHit } from "../edgar";
import { queryRows, tigerEnabled } from "../tiger";
import { assess, buildEdges, currentOwners } from "./engine";
import { fetchFacts, figures, findEvents, isActive, resolveCandidate, summarizeScan } from "./ingest";
import { SEARCH_NAME, SPONSORS } from "./sponsors";
import { displayName, loadContagion } from "./store";

/**
 * Reads any borrower through its owner. A company in the last build comes
 * from it; any other is read from EDGAR on request, the same way the build
 * reads one (the sponsor definition in its credit documents, its 8-Ks, its
 * XBRL), and assessed against the build's other companies.
 */

const SEARCH_FROM = "2016-01-01";
/** A live lookup is kept a week: credit agreements and 8-Ks change slowly. */
const LOOKUP_DAYS = 7;
/** The build's own queries, one company at a time: full-text search does not group OR inside a phrase query. */
const QUERIES = Object.values(SEARCH_NAME).flatMap((n) => [`"Sponsor" means "${n}"`, `"Sponsors" means "${n}"`]);

const memory = new Map<string, { company: ContagionCompany | null; at: number }>();

async function savedLookup(cik: string): Promise<{ company: ContagionCompany | null; checkedAt: string } | undefined> {
  const hit = memory.get(cik);
  if (hit && Date.now() - hit.at < LOOKUP_DAYS * 86_400_000) return { company: hit.company, checkedAt: new Date(hit.at).toISOString() };
  if (!tigerEnabled()) return undefined;
  const rows = await queryRows<{ company_json: ContagionCompany | null; checked_at: Date }>(
    `SELECT company_json, checked_at FROM owner_lookups WHERE cik = $1 AND checked_at > NOW() - INTERVAL '${LOOKUP_DAYS} days'`,
    [cik],
  ).catch(() => []);
  if (!rows[0]) return undefined;
  memory.set(cik, { company: rows[0].company_json, at: new Date(rows[0].checked_at).getTime() });
  return { company: rows[0].company_json, checkedAt: new Date(rows[0].checked_at).toISOString() };
}

async function saveLookup(cik: string, company: ContagionCompany | null): Promise<void> {
  memory.set(cik, { company, at: Date.now() });
  if (!tigerEnabled()) return;
  await queryRows(
    "INSERT INTO owner_lookups (cik, company_json, checked_at) VALUES ($1, $2, NOW()) ON CONFLICT (cik) DO UPDATE SET company_json = $2, checked_at = NOW()",
    [cik, company === null ? null : JSON.stringify(company)],
  ).catch(() => []);
}

/** Thrown when EDGAR did not answer, so a miss is not saved as "no owner". */
class SearchFailed extends Error {}

/** The build's reading of one company, done live: null when no followed sponsor is named in its credit documents. */
async function readCompany(cik: string, ticker: string | null, today: string): Promise<ContagionCompany | null> {
  // One at a time: EDGAR full-text search turns away bursts.
  const hits: SearchHit[] = [];
  for (const q of QUERIES) {
    const found = await fullTextSearch(cik, q, SEARCH_FROM, today).catch(() => {
      throw new SearchFailed("EDGAR full-text search did not answer; try again in a minute");
    });
    for (const h of found) if (/^EX-(4|10)/.test(h.fileType) && !hits.some((x) => x.id === h.id)) hits.push(h);
  }
  if (!hits.length) return null;
  const subs = await getSubmissions(cik).catch(() => null);
  const resolved = await resolveCandidate({ cik, name: subs?.name ?? cik, ticker, hits: hits.map((h) => ({ ...h, cik, displayName: subs?.name ?? cik })) });
  if (!resolved.links.length) return null;
  const read = await findEvents(cik, today);
  const book = await fetchFacts(cik, Infinity).catch(() => null);
  const fig = book ? figures(book, cik, today) : { distress: null, debt: null, due: null };
  const company: ContagionCompany = {
    cik,
    name: displayName(read.name ?? subs?.name ?? cik),
    ticker,
    sponsors: resolved.links,
    lastPeriodic: read.lastPeriodic,
    active: isActive(read.lastPeriodic, today),
    ...fig,
    agent: resolved.agent,
    events: read.events,
  };
  return currentOwners([company], today)[0] ?? null;
}

function familiesOf(map: ContagionMap, company: ContagionCompany, flags: Map<string, FamilyMember["flag"]>): OwnerView["families"] {
  const all = [company, ...map.companies.filter((c) => c.cik !== company.cik)];
  return company.sponsors.map((link) => ({
    sponsorId: link.sponsorId,
    name: map.sponsors.find((s) => s.id === link.sponsorId)?.name ?? SPONSORS.find((s) => s.id === link.sponsorId)?.name ?? link.sponsorId,
    members: all
      .filter((c) => c.sponsors.some((s) => s.sponsorId === link.sponsorId))
      .map((c) => ({
        cik: c.cik,
        name: c.name,
        ticker: c.ticker,
        active: c.active,
        lastPeriodic: c.lastPeriodic,
        since: c.sponsors.find((s) => s.sponsorId === link.sponsorId)?.filed ?? null,
        flag: flags.get(c.cik) ?? "clear",
        events: c.events,
        self: c.cik === company.cik,
      }))
      // The borrower first, then the companies with events, newest event first.
      .sort((a, b) => Number(b.self) - Number(a.self) || (b.events.at(-1)?.date ?? "").localeCompare(a.events.at(-1)?.date ?? "") || a.name.localeCompare(b.name)),
  }));
}

/** The owner view for one borrower; the report's own trapdoor scan fills in a company the build did not scan. */
export async function ownerView(cik: string, ticker: string | null, scan?: LmeScan | null): Promise<OwnerView | null> {
  const map = await loadContagion();
  if (!map) return null;
  const key = String(Number(cik));
  const today = new Date().toISOString().slice(0, 10);
  let company = map.companies.find((c) => c.cik === key) ?? null;
  let live = false;
  let checkedAt = map.builtAt;
  if (!company) {
    const saved = await savedLookup(key);
    if (saved) {
      company = saved.company;
      checkedAt = saved.checkedAt;
    } else {
      company = await readCompany(key, ticker, today);
      await saveLookup(key, company);
      checkedAt = new Date().toISOString();
    }
    live = true;
  }
  if (!company) return { cik: key, company: null, assessment: null, families: [], live, builtAt: map.builtAt, checkedAt };

  const stored = map.assessments.find((a) => a.cik === key);
  const withScan = company.lme === undefined && scan !== undefined ? { ...company, lme: summarizeScan(scan) } : company;
  let assessment = stored ?? null;
  if (!stored || withScan !== company) {
    const all = [...map.companies.filter((c) => c.cik !== key), withScan];
    const fresh = assess(all, buildEdges(all), SPONSORS, today).find((a) => a.cik === key) ?? null;
    assessment = fresh ? { ...fresh, warning: stored?.warning ?? null } : null;
  }
  const flags = new Map(map.assessments.map((a) => [a.cik, a.flag]));
  if (assessment) flags.set(key, assessment.flag);
  return { cik: key, company: withScan, assessment, families: familiesOf(map, withScan, flags), live, builtAt: map.builtAt, checkedAt };
}
