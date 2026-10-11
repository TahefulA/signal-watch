// Prints every Devil's Advocate pattern result for saved reports:
// npx tsx --env-file=.env.local scripts/run-patterns.ts <report id> ...
import { loadPatternContext, runPatterns } from "../lib/devils-advocate-patterns";
import { findReportById } from "../lib/tiger";

async function main() {
  for (const id of process.argv.slice(2)) {
    const report = await findReportById(id);
    if (!report) throw new Error(`No report ${id}`);
    const started = Date.now();
    const ctx = await loadPatternContext(report, new Date().toISOString().slice(0, 10));
    const results = runPatterns(ctx);
    console.log(
      `\n${report.graph.company.ticker}: ${ctx.filings.map((f) => f.label).join(", ")}; prior ${ctx.prior?.label ?? "none"}; ${ctx.insiders?.length ?? "?"} insider trades; ${Date.now() - started} ms`,
    );
    for (const r of results) {
      console.log(`${r.status.padEnd(13)} ${r.name}: ${r.detail}`);
      for (const e of r.evidence.slice(0, 2)) console.log(`    - ${e.label}${e.quote ? `: "${e.quote.slice(0, 160)}"` : ""}`);
    }
  }
  process.exit(0);
}

void main();
