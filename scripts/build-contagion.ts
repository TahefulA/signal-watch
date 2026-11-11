/**
 * Builds the sponsor contagion graph from EDGAR, offline:
 *   npx tsx --env-file=.env.local scripts/build-contagion.ts [--scan N] [--no-warn | --keep-warn]
 *
 * Every step caches to .cache/contagion, so a rerun only fetches what changed.
 * --scan N runs the trapdoor scanner on up to N companies that a sibling's
 * event reaches (one Gemini call per trapdoor each). Writes data/contagion.json
 * and, when Tiger Data is configured, the contagion tables.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { ContagionCompany, ContagionMap } from "../types";
import { cleanQuote, dedupe, fetchFacts, figures, findCandidates, findEvents, isActive, resolveCandidate, summarizeScan, type Candidate } from "../lib/contagion/ingest";
import { assess, buildEdges, currentOwners } from "../lib/contagion/engine";
import { SPONSORS } from "../lib/contagion/sponsors";
import { scanCreditDocuments } from "../lib/lme-scanner";
import { writeWarnings } from "../lib/contagion/agent";
import { saveContagion } from "../lib/contagion/store";
import { tigerEnabled } from "../lib/tiger";
import { getSubmissions } from "../lib/edgar";

const DIR = ".cache/contagion";

/**
 * Operating companies that file their own 8-Ks under a parent the graph
 * reads the sponsor from. J.Crew Group's 8-Ks carry its 2017 exchange and
 * 2020 bankruptcy; its 2020 Item 1.03 8-K names Chinos as "the direct parent
 * of the Company", and Chinos's credit documents name the sponsors.
 */
const SUBSIDIARY_FILERS: { cik: string; parentCik: string; source: string }[] = [
  { cik: "1051251", parentCik: "1513842", source: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1051251&type=8-K" },
];

/** EDGAR lists some filers in capitals: "HERTZ GLOBAL HOLDINGS, INC" reads as "Hertz Global Holdings, Inc". */
function titleCase(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/(^|[\s\-/(&.])([a-z])/g, (_, p: string, ch: string) => p + ch.toUpperCase()).replace(/\b(Llc|Lp|Plc|Sa|Nv|Ag)\b/g, (m) => m.toUpperCase());
}
const today = new Date().toISOString().slice(0, 10);

function cached<T>(name: string, make: () => Promise<T>): Promise<T> {
  const file = `${DIR}/${name}.json`;
  if (existsSync(file)) return Promise.resolve(JSON.parse(readFileSync(file, "utf8")) as T);
  return make().then((v) => {
    writeFileSync(file, JSON.stringify(v, null, 1));
    return v;
  });
}

async function main(): Promise<void> {
  mkdirSync(DIR, { recursive: true });
  const args = process.argv.slice(2);
  const scanLimit = args.includes("--scan") ? Number(args[args.indexOf("--scan") + 1]) : 0;

  const candidates = await cached("candidates", async () => Array.from((await findCandidates(today, (t) => console.log(`  ${t}`))).values()));
  console.log(`${candidates.length} candidate companies`);

  const companies: ContagionCompany[] = [];
  for (const [i, c] of (candidates as Candidate[]).entries()) {
    const company = await (async () => {
      const resolved = await cached(`resolved-${c.cik}`, () => resolveCandidate(c));
      if (!resolved.links.length) return null;
      const found = await cached(`events-${c.cik}`, () => findEvents(c.cik, today));
      const { lastPeriodic } = found;
      const events = found.events.map((e) => ({ ...e, quote: cleanQuote(e.quote) }));
      const current = found.name ?? (await getSubmissions(c.cik).then((x) => x.name).catch(() => null));
      const name = current ? titleCase(current) : c.name;
      const book = await fetchFacts(c.cik, Infinity).catch(() => null);
      const fig = book ? figures(book, c.cik, today) : { distress: null, debt: null, due: null };
      return { cik: c.cik, name, ticker: c.ticker, sponsors: resolved.links, lastPeriodic, active: isActive(lastPeriodic, today), ...fig, agent: resolved.agent, events } satisfies ContagionCompany;
    })().catch((e: unknown) => {
      console.warn(`  ${c.name}: ${String(e)}`);
      return null;
    });
    if (company) companies.push(company);
    if (i % 20 === 19) console.log(`  ${i + 1}/${candidates.length} read, ${companies.length} kept`);
  }

  for (const sub of SUBSIDIARY_FILERS) {
    const parent = companies.find((c) => c.cik === sub.parentCik);
    if (!parent) continue;
    const found = await cached(`events-${sub.cik}`, () => findEvents(sub.cik, today));
    for (const e of found.events) if (!parent.events.some((x) => x.id === e.id)) parent.events.push({ ...e, cik: parent.cik, quote: cleanQuote(e.quote) });
    parent.events.sort((a, b) => a.date.localeCompare(b.date));
    parent.lastPeriodic = [parent.lastPeriodic, found.lastPeriodic].filter(Boolean).sort().at(-1) ?? null;
    if (/^Chinos/.test(parent.name)) parent.name = "J.Crew (Chinos Holdings)";
  }

  let all = currentOwners(dedupe(companies), today);
  let edges = buildEdges(all);
  let assessments = assess(all, edges, SPONSORS, today);

  // Scan the credit documents of the live companies a sibling's event reaches, nearest first.
  const toScan = assessments
    .filter((a) => a.flag !== "history" && a.rules[0].fired)
    .map((a) => all.find((c) => c.cik === a.cik) as ContagionCompany)
    .sort((a, b) => (b.distress?.probability ?? 0) - (a.distress?.probability ?? 0))
    .slice(0, scanLimit || undefined);
  for (const c of toScan) {
    const file = `${DIR}/lme-${c.cik}.json`;
    if (existsSync(file)) {
      c.lme = JSON.parse(readFileSync(file, "utf8")) as ContagionCompany["lme"];
      continue;
    }
    if (!scanLimit) continue;
    console.log(`  Scanning ${c.name}`);
    const scan = await scanCreditDocuments(c.cik, today).catch((e: unknown) => {
      console.warn(`  scan failed: ${String(e)}`);
      return undefined;
    });
    if (scan === undefined) continue;
    c.lme = summarizeScan(scan);
    writeFileSync(file, JSON.stringify(c.lme, null, 1));
  }
  for (const c of all) {
    const file = `${DIR}/lme-${c.cik}.json`;
    if (c.lme === undefined && existsSync(file)) c.lme = JSON.parse(readFileSync(file, "utf8")) as ContagionCompany["lme"];
  }

  edges = buildEdges(all);
  assessments = assess(all, edges, SPONSORS, today);
  all = all.sort((a, b) => a.name.localeCompare(b.name));

  const map: ContagionMap = {
    builtAt: new Date().toISOString(),
    sponsors: SPONSORS.map((s) => ({
      ...s,
      companies: all.filter((c) => c.sponsors.some((l) => l.sponsorId === s.id)).length,
      events: all.filter((c) => c.sponsors.some((l) => l.sponsorId === s.id)).reduce((n, c) => n + c.events.length, 0),
    })).filter((s) => s.companies > 0),
    companies: all,
    edges,
    assessments,
    note: "Covers companies that file with the SEC and whose credit agreement or indenture names the sponsor. Many sponsor-backed borrowers are private and do not appear.",
  };

  if (args.includes("--keep-warn") && existsSync("data/contagion.json")) {
    // Reuses the last build's notes where a company's rules read exactly as before, so a data fix costs no model calls.
    const last = JSON.parse(readFileSync("data/contagion.json", "utf8")) as ContagionMap;
    for (const a of map.assessments) {
      const old = last.assessments.find((x) => x.cik === a.cik);
      if (old?.warning && JSON.stringify(old.rules) === JSON.stringify(a.rules)) a.warning = old.warning;
    }
  } else if (!args.includes("--no-warn")) await writeWarnings(map, (t) => console.log(`  ${t}`));

  writeFileSync("data/contagion.json", JSON.stringify(map));
  if (tigerEnabled()) await saveContagion(map).catch((e: unknown) => console.warn(`  Tiger Data: ${String(e)}`));

  const count = (f: string) => assessments.filter((a) => a.flag === f).length;
  console.log(`\n${all.length} companies, ${edges.length} edges, ${all.reduce((n, c) => n + c.events.length, 0)} events`);
  console.log(`target ${count("target")}, watch ${count("watch")}, clear ${count("clear")}, history ${count("history")}`);
  for (const a of assessments.filter((x) => x.flag === "target" || x.flag === "watch")) {
    const c = all.find((x) => x.cik === a.cik);
    console.log(`\n${a.flag.toUpperCase()} ${c?.name}`);
    for (const r of a.rules) console.log(`  [${r.fired ? "x" : " "}] ${r.text}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
