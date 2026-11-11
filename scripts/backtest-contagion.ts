/**
 * Backtests the contagion screen, point in time:
 *   npx tsx --env-file=.env.local scripts/backtest-contagion.ts
 *
 * On 1 January of each year from 2018 to 2024 it rebuilds what the screen
 * could have known that day (only 8-Ks filed before it, only XBRL facts filed
 * before it, only companies still filing 10-Ks or 10-Qs) and asks: did the
 * companies it would have flagged have a bankruptcy or lender squeeze in the
 * next 24 months more often than the ones it would not?
 *
 * The trapdoor rule is left out: the scans read today's credit documents, so
 * using them for 2019 would leak. The flag tested is the sibling rule plus at
 * least one of the maturity and distress rules.
 *
 * Writes model/contagion-backtest.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { ContagionCompany, ContagionMap, LmeEvent } from "../types";
import { getSubmissions } from "../lib/edgar";
import { fetchFacts, figures } from "../lib/contagion/ingest";
import { bookAsOf } from "../lib/pit";
import { daysBetween } from "../lib/dates";
import { HISTORY_YEARS, MATURITY_SHARE } from "../lib/contagion/engine";

const CUTOFFS = ["2018-01-01", "2019-01-01", "2020-01-01", "2021-01-01", "2022-01-01", "2023-01-01", "2024-01-01"];
const HORIZON_MONTHS = 24;
const ACTIVE_DAYS = 460;
const FLAGGED_BANDS = new Set(["elevated", "high", "severe"]);

function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** One-sided Fisher exact test: the chance of at least `a` events among the flagged if events fell at random. */
function fisher(a: number, flagged: number, events: number, total: number): number {
  const lf = (n: number) => {
    let s = 0;
    for (let i = 2; i <= n; i++) s += Math.log(i);
    return s;
  };
  const p = (k: number) => Math.exp(lf(events) + lf(total - events) + lf(flagged) + lf(total - flagged) - lf(total) - lf(k) - lf(events - k) - lf(flagged - k) - lf(total - flagged - events + k));
  let sum = 0;
  for (let k = a; k <= Math.min(flagged, events); k++) sum += p(k);
  return Math.min(1, sum);
}

interface Row {
  cutoff: string;
  cik: string;
  name: string;
  willing: boolean;
  maturity: boolean;
  distress: boolean;
  flagged: boolean;
  sibling: { name: string; date: string; kind: string } | null;
  outcome: LmeEvent | null;
}

async function main(): Promise<void> {
  const map = JSON.parse(readFileSync("data/contagion.json", "utf8")) as ContagionMap;
  const companies = map.companies;
  const periodic = new Map<string, string[]>();
  const books = new Map<string, Awaited<ReturnType<typeof fetchFacts>> | null>();
  for (const [i, c] of companies.entries()) {
    const subs = await getSubmissions(c.cik).catch(() => null);
    periodic.set(c.cik, (subs?.filings ?? []).filter((f) => /^10-[KQ]/.test(f.form)).map((f) => f.filingDate));
    books.set(c.cik, await fetchFacts(c.cik, Infinity).catch(() => null));
    if (i % 20 === 19) console.log(`  ${i + 1}/${companies.length} read`);
  }

  const run = (strict: boolean): Row[] => {
    const rows: Row[] = [];
    for (const T of CUTOFFS) {
      const end = addMonths(T, HORIZON_MONTHS);
      const since = `${Number(T.slice(0, 4)) - HISTORY_YEARS}${T.slice(4)}`;
      // Ownership as the credit documents filed before the cutoff state it (strict), or as they state it today.
      const owners = (c: ContagionCompany) => c.sponsors.filter((s) => !strict || s.filed < T).map((s) => s.sponsorId);
      for (const c of companies) {
        const filed = periodic.get(c.cik) ?? [];
        if (!filed.some((d) => d < T && daysBetween(d, T) <= ACTIVE_DAYS)) continue;
        // A company already in a bankruptcy is not a candidate for the next one.
        if (c.events.some((e) => e.kind === "bankruptcy" && e.date < T && daysBetween(e.date, T) < 730)) continue;
        const mine = owners(c);
        if (!mine.length) continue;
        const siblingEvents = companies
          .filter((o) => o.cik !== c.cik && owners(o).some((s) => mine.includes(s)))
          .flatMap((o) => o.events.filter((e) => e.date < T && e.date >= since).map((e) => ({ o, e })))
          .sort((x, y) => y.e.date.localeCompare(x.e.date));
        const willing = siblingEvents.length > 0;
        const book = books.get(c.cik);
        const known = book ? bookAsOf(book, T) : null;
        const fig = known ? figures(known, c.cik, T) : { distress: null, debt: null, due: null };
        const dueTotal = (fig.due?.next12 ?? 0) + (fig.due?.year2 ?? 0);
        const maturity = Boolean(fig.due && fig.debt && dueTotal >= MATURITY_SHARE * fig.debt.value);
        const distress = Boolean(fig.distress && FLAGGED_BANDS.has(fig.distress.band));
        const outcome = c.events.find((e) => e.date >= T && e.date < end) ?? null;
        rows.push({
          cutoff: T,
          cik: c.cik,
          name: c.name,
          willing,
          maturity,
          distress,
          flagged: willing && (maturity || distress),
          sibling: siblingEvents[0] ? { name: siblingEvents[0].o.name, date: siblingEvents[0].e.date, kind: siblingEvents[0].e.kind } : null,
          outcome,
        });
      }
    }
    return rows;
  };

  const summarize = (rows: Row[], pick: (r: Row) => boolean) => {
    const inG = rows.filter(pick);
    const out = rows.filter((r) => !pick(r));
    const hits = inG.filter((r) => r.outcome).length;
    const rest = out.filter((r) => r.outcome).length;
    const rate = inG.length ? hits / inG.length : 0;
    const restRate = out.length ? rest / out.length : 0;
    return {
      flagged: inG.length,
      flaggedEvents: hits,
      flaggedRate: rate,
      others: out.length,
      otherEvents: rest,
      otherRate: restRate,
      lift: restRate ? rate / restRate : null,
      pValue: fisher(hits, inG.length, hits + rest, rows.length),
      // Of the events that happened, how many the screen had flagged beforehand.
      recall: hits + rest ? hits / (hits + rest) : 0,
    };
  };

  const result = (strict: boolean) => {
    const rows = run(strict);
    return {
      companyYears: rows.length,
      companies: new Set(rows.map((r) => r.cik)).size,
      events: rows.filter((r) => r.outcome).length,
      screen: summarize(rows, (r) => r.flagged),
      siblingOnly: summarize(rows, (r) => r.willing),
      balanceSheetOnly: summarize(rows, (r) => r.maturity || r.distress),
      perCutoff: CUTOFFS.map((T) => {
        const at = rows.filter((r) => r.cutoff === T);
        return { cutoff: T, companies: at.length, flagged: at.filter((r) => r.flagged).length, flaggedEvents: at.filter((r) => r.flagged && r.outcome).length, otherEvents: at.filter((r) => !r.flagged && r.outcome).length };
      }),
      caught: rows
        .filter((r) => r.flagged && r.outcome)
        .map((r) => ({ cutoff: r.cutoff, name: r.name, event: r.outcome!.date, kind: r.outcome!.kind, url: r.outcome!.url, sibling: r.sibling, maturity: r.maturity, distress: r.distress })),
      missed: rows
        .filter((r) => !r.flagged && r.outcome)
        .map((r) => ({ cutoff: r.cutoff, name: r.name, event: r.outcome!.date, kind: r.outcome!.kind, willing: r.willing, maturity: r.maturity, distress: r.distress })),
      falseAlarms: rows.filter((r) => r.flagged && !r.outcome).length,
      // Yearly cutoffs overlap a 24-month horizon, so one event can count twice; this counts each event once.
      distinctEvents: new Set(rows.filter((r) => r.outcome).map((r) => r.outcome!.id)).size,
      distinctCaught: new Set(rows.filter((r) => r.flagged && r.outcome).map((r) => r.outcome!.id)).size,
    };
  };

  const out = {
    generatedAt: new Date().toISOString(),
    graphBuiltAt: map.builtAt,
    method: {
      cutoffs: CUTOFFS,
      horizonMonths: HORIZON_MONTHS,
      flag: "A sister company under the same sponsor had a bankruptcy or lender squeeze in the ten years before the cutoff, and at least 10% of debt was due within two years or the distress model put the company at elevated or worse",
      pointInTime: "8-Ks filed before the cutoff; XBRL facts filed before the cutoff (first-reported figures, no later restatements); the distress model as scored from those facts; companies with a 10-K or 10-Q in the 460 days before the cutoff",
      leftOut: "The trapdoor rule: the scans read today's credit documents, so they cannot be used for an earlier date without leaking",
      outcome: "A bankruptcy filing (8-K Item 1.03) or lender squeeze (8-K) in the 24 months after the cutoff",
    },
    strict: result(true),
    lenient: result(false),
    caveats: [
      "Small sample: a few dozen live sponsor-backed SEC filers a year and a handful of events, so the p-value matters more than the lift.",
      "The 13 sponsors were chosen knowing which ones have done liability management deals, which favours the sibling rule.",
      "Strict ownership counts a sponsor only from credit documents filed before the cutoff; lenient uses the documents as they stand today, which can include a sponsor that bought in later.",
      "Events are found by keyword in 8-Ks; a deal described in other words is missed in both groups.",
    ],
  };
  writeFileSync("model/contagion-backtest.json", JSON.stringify(out, null, 1));
  for (const k of ["strict", "lenient"] as const) {
    const r = out[k];
    console.log(`\n${k}: ${r.companyYears} company-years, ${r.companies} companies, ${r.events} events; ${r.distinctCaught} of ${r.distinctEvents} distinct events flagged beforehand, ${r.falseAlarms} false alarms`);
    for (const g of ["screen", "siblingOnly", "balanceSheetOnly"] as const) {
      const s = r[g];
      console.log(`  ${g}: flagged ${s.flaggedEvents}/${s.flagged} (${(s.flaggedRate * 100).toFixed(1)}%) vs others ${s.otherEvents}/${s.others} (${(s.otherRate * 100).toFixed(1)}%), lift ${s.lift?.toFixed(1)}, p ${s.pValue.toFixed(3)}, caught ${(s.recall * 100).toFixed(0)}%`);
    }
    for (const c of r.caught) console.log(`   caught ${c.cutoff} ${c.name} -> ${c.kind} ${c.event} (sibling ${c.sibling?.name} ${c.sibling?.date})`);
    for (const m of r.missed) console.log(`   missed ${m.cutoff} ${m.name} -> ${m.kind} ${m.event} w${+m.willing} m${+m.maturity} d${+m.distress}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
