/**
 * Point-in-time backtest across the wider universe.
 *
 *   npx tsx scripts/backtest.ts [--days 270] [--horizon 30]
 *
 * Scores each ticker daily over the window, takes the day a score first
 * crosses each threshold as a signal, and measures the stock against its
 * sector ETF over the following horizon.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { BacktestReport } from "@/types";
import { type BacktestInput, outcomes, summarizeOutcomes } from "@/lib/backtest";
import { addDays, toIsoDate } from "@/lib/dates";
import { fetchPrices } from "@/lib/market";
import { buildDataset } from "@/lib/pipeline";
import { BACKTEST_UNIVERSE } from "@/lib/universe";

const THRESHOLDS = [10, 15, 20, 30, 50, 70];

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (name: string, fallback: number): number => {
    const i = args.indexOf(name);
    return i >= 0 ? Number(args[i + 1]) : fallback;
  };
  const days = flag("--days", 270);
  const horizon = flag("--horizon", 30);
  const endDate = toIsoDate(new Date());
  const lastSignalDate = addDays(endDate, -horizon);
  const windowStart = addDays(endDate, -(days - 1));

  const inputs: BacktestInput[] = [];
  for (const entry of BACKTEST_UNIVERSE) {
    try {
      const dataset = await buildDataset(entry, { endDate, days, log: (m) => console.log(m) });
      const [stock, sector] = await Promise.all([
        fetchPrices(entry.ticker, addDays(windowStart, -60)),
        fetchPrices(entry.sector_etf, addDays(windowStart, -60)),
      ]);
      inputs.push({ ticker: entry.ticker, scores: dataset.scores, stock, sector });
      const max = Math.max(...dataset.scores.map((s) => s.total_score));
      console.log(`${entry.ticker}: scored ${dataset.scores.length} days, max ${max}`);
    } catch (error) {
      console.error(`${entry.ticker}: skipped (${String(error)})`);
    }
  }

  const thresholds = THRESHOLDS.map((t) => {
    const results = outcomes(inputs, t, horizon, lastSignalDate);
    return summarizeOutcomes(t, results);
  });
  const report: BacktestReport = {
    generated_at: new Date().toISOString(),
    window_start: windowStart,
    window_end: lastSignalDate,
    horizon_days: horizon,
    tickers: inputs.map((i) => i.ticker),
    ticker_days: inputs.reduce((n, i) => n + i.scores.filter((s) => s.date <= lastSignalDate).length, 0),
    thresholds,
  };
  await writeFile(path.join(process.cwd(), "data", "backtest.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.table(thresholds);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
