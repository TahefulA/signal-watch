// Prints the validation and entity summary of a saved CLI run: node scripts/inspect-report.mjs wulf
import { readFileSync } from "node:fs";
const r = JSON.parse(readFileSync(`.cache/report-${process.argv[2] ?? "wulf"}.json`, "utf8"));
const v = r.validation;
console.log(`proposed ${v.proposed} kept ${v.kept} rejected ${v.rejected.length} merges ${v.merges.length} retried ${Boolean(v.retried)}`);
for (const x of v.rejected) console.log(`  REJECTED ${x.name} - ${x.reason}`);
for (const m of v.merges) console.log(`  MERGED ${m.merged} into ${m.kept} (${m.reason})`);
const count = (key) => Object.entries(r.graph.nodes.slice(1).reduce((a, n) => ({ ...a, [n[key]]: (a[n[key]] ?? 0) + 1 }), {})).map(([k, n]) => `${k}:${n}`).join(" ");
console.log(`types ${count("type")}\nconfidence ${count("confidence")}`);
for (const n of r.graph.nodes) console.log(`${n.name} | ${n.type} | ${n.relationDetail ?? ""} | ${n.confidence} | ${n.sourceType} ${n.fiscalPeriod ?? ""} | ${n.magnitude?.label ?? ""} | ${n.headline ?? ""}`);
const c = r.graph.company;
console.log(`industry: ${c.industry} | sic: ${c.sic} | ratings: ${JSON.stringify(c.ratings?.map((x) => `${x.agency} ${x.rating}`))}`);
