// Writes the Devil's Advocate case for a saved report without saving it, and prints a summary:
// npx tsx --env-file=.env.local scripts/run-case.ts <report id> [peer report id ...]
import { writeFileSync } from "node:fs";
import { generateDevilsAdvocate } from "../lib/devils-advocate";
import { loadPatternContext } from "../lib/devils-advocate-patterns";
import { findReportById } from "../lib/tiger";

async function main() {
  const [id, ...peerIds] = process.argv.slice(2);
  const report = await findReportById(id);
  if (!report) throw new Error(`No report ${id}`);
  const peers = (await Promise.all(peerIds.map((p) => findReportById(p)))).filter((p) => p !== null);
  const started = Date.now();
  const ctx = await loadPatternContext(report, new Date().toISOString().slice(0, 10));
  const loaded = Date.now();
  const devil = await generateDevilsAdvocate(report, ctx, peers);
  console.log(`${report.graph.company.ticker}: context ${loaded - started} ms, case ${Date.now() - loaded} ms, ${devil.removed} sentences removed`);
  console.log(JSON.stringify(devil.period));
  console.log(`\nPRIMER: ${devil.primer}\n\nBOTTOM LINE: ${devil.bottomLine?.map((s) => s.text).join("")}\n`);
  for (const s of devil.sections ?? []) {
    const words = s.argument.map((a) => a.text).join("").split(/\s+/).length;
    console.log(`[${s.theme} | ${s.strength} | ${words} words | ${s.exhibits.length} exhibits | ${s.citations.map((c) => c.source).join("; ")}]\n${s.headline}\nMEMO: ${s.memoSays}\n${s.argument.map((a) => a.text).join("")}\nPLAIN: ${s.plainEnglish}\nWHY: ${s.whyItMatters}\n`);
  }
  console.log(`REBUTTAL: ${devil.rebuttal}\n`);
  for (const w of devil.watchList ?? []) console.log(`WATCH: ${w.item} | ${w.when} | ${w.signal}`);
  console.log(`\n${devil.events?.length} events, ${devil.glossary?.length} terms; coverage:`);
  for (const c of devil.coverage ?? []) console.log(`  ${c.read ? "read" : "NOT "} ${c.label}: ${c.detail}`);
  writeFileSync(`${process.env.CASE_OUT ?? "."}/case-${report.graph.company.ticker}.json`, JSON.stringify(devil, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
