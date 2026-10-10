/** Runs the pipeline from the command line: npx tsx --env-file=.env.local scripts/analyze.ts WULF */
import { writeFile } from "node:fs/promises";
import { analyzeTicker } from "@/lib/analyze";

const ticker = process.argv[2] ?? "WULF";
const started = Date.now();
analyzeTicker(ticker, (step) => console.log(`${((Date.now() - started) / 1000).toFixed(1)}s  ${step}`))
  .then(async (report) => {
    const out = `.cache/report-${ticker.toLowerCase()}.json`;
    await writeFile(out, JSON.stringify(report, null, 2));
    console.log(`${((Date.now() - started) / 1000).toFixed(1)}s  done: ${report.graph.nodes.length - 1} entities, ${report.graph.edges.length} edges -> ${out}`);
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
