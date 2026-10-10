/** Checks the new-filing alert against a baseline report: npx tsx --env-file=.env.local scripts/check-alerts.ts WULF 2026-08-04 */
import { filingsSince } from "@/lib/dashboard";
import { findBaseline } from "@/lib/tiger";

async function main(): Promise<void> {
  const [ticker = "WULF", asOf = "2026-08-04"] = process.argv.slice(2);
  const baseline = await findBaseline(ticker, asOf);
  if (!baseline) throw new Error(`No baseline for ${ticker} as of ${asOf}`);
  console.log((await filingsSince(baseline)).map((f) => f.title));
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
