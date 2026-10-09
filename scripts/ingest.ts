/**
 * Builds the featured datasets from live sources and writes them to fixtures/
 * and, when DATABASE_URL is set, to Tiger Data.
 *
 *   npx tsx scripts/ingest.ts [TICKER ...] [--days 90] [--end YYYY-MM-DD]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { toIsoDate } from "@/lib/dates";
import { buildDataset } from "@/lib/pipeline";
import { FEATURED } from "@/lib/universe";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const days = Number(flag("--days") ?? 90);
  const endDate = flag("--end") ?? toIsoDate(new Date());
  const tickers = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
  const entries = tickers.length > 0 ? FEATURED.filter((e) => tickers.includes(e.ticker)) : FEATURED;

  const outDir = path.join(process.cwd(), "fixtures");
  await mkdir(outDir, { recursive: true });

  for (const entry of entries) {
    const dataset = await buildDataset(entry, { endDate, days, log: (m) => console.log(m) });
    const file = path.join(outDir, `${entry.ticker.toLowerCase()}.json`);
    await writeFile(file, `${JSON.stringify(dataset, null, 1)}\n`);
    const latest = dataset.scores.at(-1);
    console.log(`${entry.ticker}: ${dataset.scores.length} days, ${dataset.events.length} events, latest ${latest?.total_score} -> ${file}`);
    const tiger = await import("@/lib/tiger");
    if (tiger.tigerEnabled()) {
      const { saveDataset } = tiger;
      await saveDataset(dataset);
      console.log(`${entry.ticker}: stored in Tiger Data`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
