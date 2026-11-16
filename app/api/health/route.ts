import { DEMO_TICKERS } from "@/lib/demo-tickers";
import { queryRows, tigerEnabled } from "@/lib/tiger";
import { dailyBudget, spentToday } from "@/lib/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The warm-up keeps every demo ticker under a day old; two days means it has stopped. */
const DEMO_MAX_HOURS = 48;

type Check = { name: string; ok: boolean; detail: string };

/**
 * GET: is the site doing its job? 200 when every check passes, 503 with the
 * failing ones otherwise. Polled by .github/workflows/uptime.yml. Holds
 * nothing private: ages, counts and today's spend.
 */
export async function GET(): Promise<Response> {
  const checks: Check[] = [];
  const started = Date.now();
  if (!tigerEnabled()) {
    checks.push({ name: "database", ok: false, detail: "not configured" });
  } else {
    try {
      await queryRows("SELECT 1");
      checks.push({ name: "database", ok: true, detail: `${Date.now() - started} ms` });

      const [demo] = await queryRows<{ hours: number | null; missing: number }>(
        `SELECT MAX(age)::float AS hours, ($2::int - COUNT(*))::int AS missing FROM (
           SELECT EXTRACT(EPOCH FROM NOW() - MAX(generated_at)) / 3600 AS age FROM reports
            WHERE as_of IS NULL AND ticker = ANY($1) GROUP BY ticker) t`,
        [DEMO_TICKERS, DEMO_TICKERS.length],
      );
      const hours = demo?.hours ?? null;
      checks.push({
        name: "warm-up",
        ok: hours !== null && hours < DEMO_MAX_HOURS && (demo?.missing ?? 0) === 0,
        detail: `stalest demo report ${hours === null ? "none" : `${hours.toFixed(1)} h old`}${demo?.missing ? `, ${demo.missing} never analysed` : ""}`,
      });

      const [errs] = await queryRows<{ n: number }>("SELECT COUNT(*)::int AS n FROM app_errors WHERE at > NOW() - INTERVAL '1 hour' AND source = 'server'");
      checks.push({ name: "server errors", ok: (errs?.n ?? 0) < 50, detail: `${errs?.n ?? 0} in the last hour` });

      const spent = await spentToday();
      checks.push({ name: "budget", ok: spent < dailyBudget(), detail: `$${spent.toFixed(2)} of $${dailyBudget().toFixed(2)} today` });
    } catch (error) {
      checks.push({ name: "database", ok: false, detail: error instanceof Error ? error.message : "query failed" });
    }
  }
  const ok = checks.every((c) => c.ok);
  return Response.json({ ok, checks, at: new Date().toISOString() }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
