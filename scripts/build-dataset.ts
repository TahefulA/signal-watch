// Builds the distress training set from SEC EDGAR, point in time:
// npx tsx --env-file=.env.local scripts/build-dataset.ts [non-event sample size, default 1200]
//
// Events: the first 8-K reporting Item 1.03 (bankruptcy or receivership) per company, 2012 on.
// Universe: every company tagging total assets in XBRL at a calendar year end, 2012 to 2024.
// Sample: every universe company with an event, plus a random sample of the rest. Each
// non-event company carries weight 1 / (sampled share), so weighted results describe the
// whole universe rather than the event-enriched sample.
// Rows: one per 10-K or 10-Q, scored the day after it was filed with only facts filed
// before that day. Label 1 when the company's event falls within the next 365 days.
import { mkdir, writeFile } from "node:fs/promises";
import { addDays, daysBetween } from "../lib/dates";
import { FEATURES, FEATURE_CONCEPTS, buildFeatures } from "../lib/features";
import { cachedFetchText } from "../lib/fetch-cache";
import { type FactBook, fetchFacts } from "../lib/xbrl";

const UA = process.env.SEC_USER_AGENT ?? "SignalWatch/1.0 (contact@signalwatch.xyz)";
const SAMPLE = Number(process.argv[2] ?? 1200);
const FIRST_OBS = "2012-01-01";
/** Rows must have a full year of outcomes behind them. */
const LAST_OBS = "2025-09-30";
const LAST_EVENT = "2026-10-31";
const SEED = 20261110;

async function sec(url: string): Promise<string> {
  return cachedFetchText(url, { headers: { "User-Agent": UA }, throttleKey: "sec", minIntervalMs: 150, maxAgeMs: Infinity, timeoutMs: 30_000 });
}

interface Hit {
  _source: { ciks: string[]; display_names: string[]; file_date: string; items?: string[]; form: string; adsh: string };
}

/** First Item 1.03 8-K per CIK, searched month by month so no page passes the search index's 10,000-hit cap. */
async function bankruptcyEvents(): Promise<Map<number, { date: string; name: string; adsh: string }>> {
  const events = new Map<number, { date: string; name: string; adsh: string }>();
  for (let month = "2012-01-01"; month <= LAST_EVENT; month = addMonths(month, 1)) {
    const end = addDays(addMonths(month, 1), -1);
    for (let from = 0; ; from += 100) {
      const url = `https://efts.sec.gov/LATEST/search-index?q=%22Item%201.03%22&forms=8-K&dateRange=custom&startdt=${month}&enddt=${end}&from=${from}`;
      const json = JSON.parse(await sec(url)) as { hits: { total: { value: number }; hits: Hit[] } };
      for (const h of json.hits.hits) {
        if (!h._source.items?.includes("1.03")) continue;
        for (const [i, raw] of h._source.ciks.entries()) {
          const cik = Number(raw);
          const prior = events.get(cik);
          if (!prior || h._source.file_date < prior.date) {
            events.set(cik, { date: h._source.file_date, name: (h._source.display_names[i] ?? "").replace(/\s+\(CIK.*$/, ""), adsh: h._source.adsh });
          }
        }
      }
      if (from + 100 >= Math.min(json.hits.total.value, 10_000)) break;
    }
    process.stdout.write(`\revents through ${month}: ${events.size}   `);
  }
  console.log();
  return events;
}

function addMonths(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

/** Every company tagging Assets at a calendar year end, 2012 to 2024. */
async function universe(): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  for (let year = 2012; year <= 2024; year++) {
    const json = JSON.parse(await sec(`https://data.sec.gov/api/xbrl/frames/us-gaap/Assets/USD/CY${year}Q4I.json`)) as {
      data: { cik: number; entityName: string }[];
    };
    for (const d of json.data) out.set(d.cik, d.entityName);
  }
  return out;
}

/** Deterministic shuffle, so the sample is the same on every run. */
function shuffle<T>(items: T[], seed: number): T[] {
  let s = seed;
  const rand = () => ((s = (s * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31);
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function trim(book: FactBook): FactBook {
  const out: FactBook = new Map();
  for (const c of FEATURE_CONCEPTS) {
    const facts = book.get(c);
    if (facts) out.set(c, facts);
  }
  return out;
}

/** Days the company's 10-Ks and 10-Qs were filed, from its own XBRL. */
function filingDays(book: FactBook): string[] {
  const days = new Set<string>();
  for (const f of book.get("Assets") ?? []) if (!f.start && /^10-[KQ]$/.test(f.form)) days.add(f.filed);
  return Array.from(days).sort();
}

function csvCell(v: string | number | null): string {
  if (v === null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(Number(v.toFixed(6))) : "";
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

async function main() {
  await mkdir("data", { recursive: true });
  console.log("Reading the company universe...");
  const all = await universe();
  console.log(`${all.size} companies tagged total assets at a year end, 2012 to 2024`);
  const events = await bankruptcyEvents();
  const eventCiks = Array.from(events.keys()).filter((c) => all.has(c));
  const nonEvent = Array.from(all.keys()).filter((c) => !events.has(c));
  const sampled = shuffle(nonEvent, SEED).slice(0, SAMPLE);
  const weight = nonEvent.length / sampled.length;
  console.log(`${events.size} companies filed an Item 1.03 8-K; ${eventCiks.length} are in the universe. Sampling ${sampled.length} of ${nonEvent.length} others (weight ${weight.toFixed(2)}).`);

  await writeFile(
    "data/events.json",
    JSON.stringify(
      eventCiks.map((cik) => ({ cik, ...events.get(cik) })),
      null,
      1,
    ),
  );

  const header = ["cik", "name", "stratum", "weight", "obs_date", "period_end", "year", "label", "event_date", "months_to_event", "max_input_filed", "z", ...FEATURES];
  const lines = [header.join(",")];
  let rows = 0;
  let positives = 0;
  let leaks = 0;
  let done = 0;
  const companies = [...eventCiks.map((cik) => ({ cik, stratum: "event" as const })), ...sampled.map((cik) => ({ cik, stratum: "sample" as const }))];
  for (const { cik, stratum } of companies) {
    done++;
    const event = events.get(cik) ?? null;
    let book: FactBook;
    try {
      book = trim(await fetchFacts(String(cik), Infinity));
    } catch {
      continue;
    }
    for (const filed of filingDays(book)) {
      const obs = addDays(filed, 1);
      if (obs < FIRST_OBS || obs > LAST_OBS) continue;
      if (event && obs >= event.date) break;
      const row = buildFeatures(book, String(cik), obs);
      if (!row) continue;
      const maxFiled = row.inputs.reduce((m, i) => (i.filed > m ? i.filed : m), "");
      if (maxFiled >= obs) leaks++;
      const daysTo = event ? daysBetween(obs, event.date) : null;
      const label = daysTo !== null && daysTo <= 365 ? 1 : 0;
      positives += label;
      rows++;
      lines.push(
        [
          cik,
          all.get(cik) ?? event?.name ?? "",
          stratum,
          stratum === "event" ? 1 : weight,
          obs,
          row.periodEnd,
          Number(obs.slice(0, 4)),
          label,
          event?.date ?? null,
          daysTo === null ? null : daysTo / 30.44,
          maxFiled,
          row.zScore,
          ...FEATURES.map((f) => row.values[f]),
        ]
          .map(csvCell)
          .join(","),
      );
    }
    if (done % 25 === 0) process.stdout.write(`\r${done}/${companies.length} companies, ${rows} rows, ${positives} positive   `);
  }
  console.log();
  await writeFile("data/dataset.csv", `${lines.join("\n")}\n`);
  await writeFile(
    "data/dataset-meta.json",
    JSON.stringify(
      {
        builtAt: new Date().toISOString(),
        universe: all.size,
        eventsFound: events.size,
        eventsInUniverse: eventCiks.length,
        nonEventPopulation: nonEvent.length,
        nonEventSampled: sampled.length,
        sampleWeight: weight,
        rows,
        positiveRows: positives,
        leakingRows: leaks,
        firstObservation: FIRST_OBS,
        lastObservation: LAST_OBS,
        lastEvent: LAST_EVENT,
      },
      null,
      2,
    ),
  );
  console.log(`Wrote data/dataset.csv: ${rows} rows, ${positives} with a bankruptcy within 12 months, ${leaks} rows using a figure filed on or after the scoring date.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
