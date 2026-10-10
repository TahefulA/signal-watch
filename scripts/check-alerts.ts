/** Checks the new-filing alert against a baseline report: npx tsx --env-file=.env.local scripts/check-alerts.ts WULF 2026-08-04 */
import { filingsSince } from "@/lib/dashboard";
import { queryRows } from "@/lib/tiger";
import type { Report } from "@/types";

async function main(): Promise<void> {
  const [ticker = "WULF", asOf = "2026-08-04"] = process.argv.slice(2);
  const rows = await queryRows<{ report_json: Report }>(
    "SELECT report_json FROM reports WHERE ticker = $1 AND as_of = $2 ORDER BY generated_at DESC LIMIT 1",
    [ticker, asOf],
  );
  const baseline = rows[0]?.report_json;
  if (!baseline) throw new Error(`No baseline for ${ticker} as of ${asOf}`);
  console.log((await filingsSince(baseline)).map((f) => f.title));
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
