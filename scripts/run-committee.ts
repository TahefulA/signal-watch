// Runs the forecast layer and a committee on a report JSON file without the database, and prints it:
// npx tsx --env-file=.env.local scripts/run-committee.ts .cache/report-wulf.json
import { readFileSync, writeFileSync } from "node:fs";
import type { Report } from "../types";
import { patternsFor } from "../lib/committee/patterns";
import { runCommittee } from "../lib/committee/run";
import { toIsoDate } from "../lib/dates";
import { ensureForecast } from "../lib/forecast-report";

async function main() {
  const file = process.argv[2];
  const raw = JSON.parse(readFileSync(file, "utf8")) as Report | { report: Report };
  const saved = "report" in raw ? raw.report : raw;
  const today = toIsoDate(new Date());
  // Scores without writing history: the database may be offline.
  process.env.DATABASE_URL = "";
  process.env.TIGER_DATABASE_URL = "";
  const { report } = await ensureForecast(saved, today);
  const d = report.distress;
  console.log(`${report.graph.company.ticker}: distress ${d ? `${(d.probability * 100).toFixed(2)}% (${d.band}), Z'' ${d.zScore?.toFixed(2)}, leak-free ${d.leakFree}` : "none"}`);
  for (const r of d?.reasons ?? []) console.log(`  + ${r.label}: ${r.display} (${r.contribution.toFixed(2)})`);
  for (const r of d?.offsets ?? []) console.log(`  - ${r.label}: ${r.display} (${r.contribution.toFixed(2)})`);
  const fc = report.filingChange;
  console.log(`filing change: ${fc ? `${fc.overall.toFixed(3)} overall, flagged ${fc.flagged}` : "none"}`);
  const rs = report.rateStress;
  console.log(`rates: floating ${rs?.floatingDebt} of ${rs?.totalDebt}; ${rs?.note ?? ""}`);
  for (const s of rs?.scenarios ?? []) console.log(`  ${s.key}: ${s.upper}% extra ${s.extraInterest.toFixed(0)} runs out ${s.runsOutAt}`);
  const patterns = await patternsFor(report, today);
  const record = await runCommittee(report, patterns, (e) => {
    if (e.type === "trace") console.log(`  · ${e.text}`);
    if (e.type === "verify" && e.status === "unsupported") console.log(`    ✗ ${e.problems.join(" ")}`);
  });
  for (const t of record.turns) console.log(`\n${t.id} ${t.speaker} ${t.move}${t.replyingTo ? ` → ${t.replyingTo}` : ""} [${t.status}] (${t.evidenceId ?? "no evidence"})\n  ${t.text}`);
  console.log("\nscore", record.score, `calls ${record.calls}, ${record.elapsedMs} ms`);
  console.log("chair", JSON.stringify(record.chair, null, 1));
  writeFileSync(file.replace(/\.json$/, "-committee.json"), JSON.stringify({ ...report, committee: record }, null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
