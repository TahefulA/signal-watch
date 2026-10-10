/** Writes the node, edge and debt tables for every saved report: npx tsx --env-file=.env.local scripts/backfill-graph.ts */
import { backfillGraph, findReportById, listReportIds } from "@/lib/tiger";

async function main(): Promise<void> {
  const ids = await listReportIds();
  for (const id of ids) {
    const report = await findReportById(id);
    if (!report) continue;
    const started = Date.now();
    await backfillGraph(report);
    console.log(`${report.graph.company.ticker} ${id} ${report.graph.nodes.length} nodes ${Date.now() - started} ms`);
  }
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
