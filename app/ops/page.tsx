import type { Metadata } from "next";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { PRICES } from "@/lib/llm-pricing";
import { queryRows, tigerEnabled } from "@/lib/tiger";

export const metadata: Metadata = { title: "System · Signal Watch" };
export const dynamic = "force-dynamic";

/**
 * How the AI side runs in production, from llm_calls: one row per Gemini
 * attempt, written by lib/gemini.ts. Costs are list prices for calls on the
 * site's key; calls made with a visitor's own key are counted but not costed.
 */

type Totals = { calls: number; ok: number; traces: number; cost: number | null; input: number | null; output: number | null; first: string | null };
type TaskRow = { task: string; calls: number; ok_rate: number; p50: number | null; p95: number | null; avg_in: number | null; avg_out: number | null; cost: number | null };
type RouteRow = { route: string; traces: number; cost_p50: number | null; cost_p95: number | null; calls_avg: number; retried: number };
type OutcomeRow = { outcome: string; n: number };
type DayRow = { day: string; calls: number; cost: number | null };

const DAYS = 30;
const WINDOW = `at > NOW() - INTERVAL '${DAYS} days'`;

async function load() {
  const [totals] = await queryRows<Totals>(
    `SELECT COUNT(*)::int AS calls, COUNT(*) FILTER (WHERE outcome = 'ok')::int AS ok, COUNT(DISTINCT trace_id)::int AS traces,
            SUM(cost_usd) FILTER (WHERE NOT own_key)::float AS cost, SUM(input_tokens)::float AS input, SUM(output_tokens + COALESCE(thinking_tokens, 0))::float AS output,
            MIN(at)::text AS first
       FROM llm_calls WHERE ${WINDOW}`,
  );
  const tasks = await queryRows<TaskRow>(
    `SELECT task, COUNT(*)::int AS calls, AVG((outcome = 'ok')::int)::float AS ok_rate,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY ms) FILTER (WHERE outcome = 'ok') AS p50,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY ms) FILTER (WHERE outcome = 'ok') AS p95,
            AVG(input_tokens) FILTER (WHERE outcome = 'ok')::float AS avg_in,
            AVG(output_tokens + COALESCE(thinking_tokens, 0)) FILTER (WHERE outcome = 'ok')::float AS avg_out,
            SUM(cost_usd) FILTER (WHERE NOT own_key)::float AS cost
       FROM llm_calls WHERE ${WINDOW} GROUP BY task ORDER BY calls DESC`,
  );
  const routes = await queryRows<RouteRow>(
    `WITH t AS (
       SELECT route, trace_id, SUM(cost_usd) FILTER (WHERE NOT own_key) AS cost, COUNT(*) AS calls, BOOL_OR(attempt > 1) AS retried
         FROM llm_calls WHERE ${WINDOW} AND trace_id IS NOT NULL GROUP BY route, trace_id)
     SELECT route, COUNT(*)::int AS traces,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY cost) AS cost_p50,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY cost) AS cost_p95,
            AVG(calls)::float AS calls_avg, AVG(retried::int)::float AS retried
       FROM t GROUP BY route ORDER BY traces DESC`,
  );
  const outcomes = await queryRows<OutcomeRow>(`SELECT outcome, COUNT(*)::int AS n FROM llm_calls WHERE ${WINDOW} GROUP BY outcome ORDER BY n DESC`);
  const days = await queryRows<DayRow>(
    `SELECT at::date::text AS day, COUNT(*)::int AS calls, SUM(cost_usd) FILTER (WHERE NOT own_key)::float AS cost
       FROM llm_calls WHERE ${WINDOW} GROUP BY 1 ORDER BY 1 DESC LIMIT 14`,
  );
  return { totals, tasks, routes, outcomes, days };
}

const usd = (x: number | null, d = 4) => (x === null ? "n/a" : `$${x.toFixed(d)}`);
const sec = (ms: number | null) => (ms === null ? "n/a" : `${(ms / 1000).toFixed(1)}s`);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const int = (x: number | null) => (x === null ? "n/a" : Math.round(x).toLocaleString("en-US"));
const OUTCOME: Record<string, string> = { ok: "Succeeded", "429": "Rate-limited (429)", "503": "Overloaded (503)", "500": "Server error (500)", timeout: "Timed out", network: "Network error", parse: "Invalid JSON" };

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="surface rounded-xs border border-zinc-800 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 font-mono text-2xl text-zinc-50">{value}</p>
      {sub ? <p className="mt-1 text-xs text-zinc-500">{sub}</p> : null}
    </div>
  );
}

function H2({ children, note }: { children: string; note?: string }) {
  return (
    <>
      <h2 className="mt-12 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{children}</h2>
      {note ? <p className="mt-1 max-w-3xl text-[13px] text-zinc-400">{note}</p> : null}
    </>
  );
}

const TH = "py-2 pr-4 font-medium";
const TD = "py-2 pr-4 font-mono";

export default async function OpsPage() {
  let data: Awaited<ReturnType<typeof load>> | null = null;
  let error: string | null = null;
  if (tigerEnabled()) {
    try {
      data = await load();
    } catch (e) {
      error = e instanceof Error ? e.message : "The telemetry could not be read.";
    }
  } else {
    error = "No database is configured.";
  }
  const t = data?.totals;

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-[1100px] px-4 py-12 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-red-500">System</p>
        <h1 className="mt-2 font-display text-[32px] font-semibold leading-tight text-zinc-50">How the AI runs in production</h1>
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-zinc-400">
          Every Gemini call is logged with its feature, model, attempt, outcome, latency and token counts. These are the last {DAYS} days, live from that log. Costs use Google&rsquo;s list prices
          ({Object.entries(PRICES)
            .map(([m, p]) => `${m} $${p.input} in / $${p.output} out per million tokens`)
            .join("; ")}
          ) and leave out calls made with a visitor&rsquo;s own key.
        </p>

        {error ? <p className="mt-8 text-sm text-amber-400">{error}</p> : null}
        {t && t.calls === 0 ? <p className="mt-8 text-sm text-zinc-400">No calls logged yet in this window.</p> : null}

        {t && t.calls > 0 && data ? (
          <>
            <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Model calls" value={t.calls.toLocaleString("en-US")} sub={`${t.traces.toLocaleString("en-US")} user actions since ${t.first?.slice(0, 10)}`} />
              <Stat label="Succeeded" value={pct(t.ok / t.calls)} sub="of attempts, before retries and fallback" />
              <Stat label="Spend" value={usd(t.cost, 2)} sub={`${int(t.input)} tokens in, ${int(t.output)} out`} />
              <Stat label="Per user action" value={usd(t.cost !== null && t.traces ? t.cost / t.traces : null, 4)} sub="average across every route" />
            </div>

            <H2 note="One user action is one request: an analysis, a committee run, a question. Retried means at least one call in it needed a second attempt or the fallback model.">Cost per user action</H2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-xs">
                <thead className="text-zinc-500">
                  <tr>
                    <th className={TH}>Route</th>
                    <th className={TH}>Actions</th>
                    <th className={TH}>Median cost</th>
                    <th className={TH}>p95 cost</th>
                    <th className={TH}>Model calls each</th>
                    <th className={TH}>Retried</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-200">
                  {data.routes.map((r) => (
                    <tr key={r.route} className="border-t border-zinc-800">
                      <td className="py-2 pr-4">/api/{r.route}</td>
                      <td className={TD}>{r.traces}</td>
                      <td className={TD}>{usd(r.cost_p50)}</td>
                      <td className={TD}>{usd(r.cost_p95)}</td>
                      <td className={TD}>{r.calls_avg.toFixed(1)}</td>
                      <td className={TD}>{pct(r.retried)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <H2 note="Latency counts successful attempts only. Tokens out include the model's thinking tokens, which Google bills as output.">By feature</H2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="text-zinc-500">
                  <tr>
                    <th className={TH}>Task</th>
                    <th className={TH}>Calls</th>
                    <th className={TH}>Succeeded</th>
                    <th className={TH}>p50</th>
                    <th className={TH}>p95</th>
                    <th className={TH}>Tokens in</th>
                    <th className={TH}>Tokens out</th>
                    <th className={TH}>Spend</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-200">
                  {data.tasks.map((r) => (
                    <tr key={r.task} className="border-t border-zinc-800">
                      <td className="py-2 pr-4">{r.task}</td>
                      <td className={TD}>{r.calls}</td>
                      <td className={TD}>{pct(r.ok_rate)}</td>
                      <td className={TD}>{sec(r.p50)}</td>
                      <td className={TD}>{sec(r.p95)}</td>
                      <td className={TD}>{int(r.avg_in)}</td>
                      <td className={TD}>{int(r.avg_out)}</td>
                      <td className={TD}>{usd(r.cost, 4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-12 grid gap-10 md:grid-cols-2">
              <div>
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Outcomes</h2>
                <table className="mt-3 w-full text-left text-xs">
                  <tbody className="text-zinc-200">
                    {data.outcomes.map((o) => (
                      <tr key={o.outcome} className="border-t border-zinc-800">
                        <td className="py-2 pr-4">{OUTCOME[o.outcome] ?? `HTTP ${o.outcome}`}</td>
                        <td className={TD}>{o.n}</td>
                        <td className={TD}>{pct(o.n / t.calls)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">By day</h2>
                <table className="mt-3 w-full text-left text-xs">
                  <tbody className="text-zinc-200">
                    {data.days.map((d) => (
                      <tr key={d.day} className="border-t border-zinc-800">
                        <td className="py-2 pr-4 font-mono">{d.day}</td>
                        <td className={TD}>{d.calls} calls</td>
                        <td className={TD}>{usd(d.cost, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </main>
      <Footer />
    </div>
  );
}
