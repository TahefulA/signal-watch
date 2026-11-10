/**
 * Runs the credit document scanner for one ticker, offline:
 *   npx tsx --env-file=.env.local scripts/run-lme.ts SATS
 */
import { writeFileSync } from "node:fs";
import { lookupCik } from "../lib/edgar";
import { scanCreditDocuments, TRAPDOOR_LABELS } from "../lib/lme-scanner";

async function main(): Promise<void> {
  const ticker = (process.argv[2] ?? "SATS").toUpperCase();
  const today = process.argv[3] ?? new Date().toISOString().slice(0, 10);
  // A CIK can be passed instead of a ticker, for a company whose ticker has moved on.
  const company = /^\d+$/.test(ticker) ? { cik: ticker, title: `CIK ${ticker}` } : await lookupCik(ticker);
  if (!company) throw new Error(`No CIK for ${ticker}`);
  const started = Date.now();
  const scan = await scanCreditDocuments(company.cik, today, (t) => console.log(`  ${t}`));
  if (!scan) return console.log(`${ticker}: no indenture or credit agreement found on EDGAR`);
  writeFileSync(`.cache/lme-${ticker.toLowerCase()}.json`, JSON.stringify(scan, null, 2));
  console.log(`\n${company.title} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
  for (const d of scan.documents) console.log(`  ${d.exhibit} ${d.filed} ${d.title} (${d.chars.toLocaleString()} chars)`);
  for (const v of scan.verdicts) console.log(`\n${TRAPDOOR_LABELS[v.trapdoor]}: ${v.risk.toUpperCase()}. ${v.basis}`);
  for (const c of scan.clauses) console.log(`\n[${c.verified ? "VERIFIED" : "STRUCK"}] ${TRAPDOOR_LABELS[c.trapdoor]} ${c.status} ${c.section ?? ""}\n  "${(c.quote ?? c.claimed).slice(0, 260)}"\n  ${c.why}`);
  console.log(`\n${scan.struck} struck`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
