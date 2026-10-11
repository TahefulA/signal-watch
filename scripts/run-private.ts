// Writes a private-company case from local text files, without saving it:
// npx tsx --env-file=.env.local scripts/run-private.ts "<company>" <thesis.txt> <document.txt> [more documents]
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { generatePrivateCase } from "../lib/devils-private";

async function main() {
  const [company, thesisPath, ...docPaths] = process.argv.slice(2);
  const documents = docPaths.map((p) => ({ name: basename(p), text: readFileSync(p, "utf8") }));
  const started = Date.now();
  const devil = await generatePrivateCase({ company, period: null, thesis: readFileSync(thesisPath, "utf8"), documents }, new Date().toISOString().slice(0, 10));
  console.log(`${company}: ${Date.now() - started} ms, ${devil.removed} sentences removed, ${devil.sections?.length} sections`);
  console.log(`\nPRIMER: ${devil.primer}\n\nBOTTOM LINE: ${devil.bottomLine?.map((s) => s.text).join("")}\n`);
  for (const s of devil.sections ?? []) {
    console.log(`[${s.theme} | ${s.strength} | ${s.exhibits[0]?.rows.length ?? 0} figures | ${s.citations.map((c) => c.source).join("; ")}]\n${s.headline}\n${s.argument.map((a) => a.text).join("")}\nPLAIN: ${s.plainEnglish}\n`);
  }
  for (const p of devil.patterns.filter((x) => x.status === "fired")) console.log(`FIRED ${p.name}: ${p.detail}`);
  console.log(`\n${devil.events?.length} events`);
  for (const c of devil.coverage ?? []) console.log(`  ${c.read ? "read" : "NOT "} ${c.label}: ${c.detail}`);
  writeFileSync(`${process.env.CASE_OUT ?? "."}/private-case.json`, JSON.stringify(devil, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
