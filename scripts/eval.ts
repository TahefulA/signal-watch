/**
 * Evaluates the analysis pipeline on the 30 companies in evals/golden.json:
 * the full run a visitor triggers (EDGAR, Gemini extraction, validation,
 * memo, signal summary, capital structure, bankruptcy score), checked against
 * what is known to be true, with the cost and latency of each run from
 * llm_calls. It writes to the "eval" schema, never to production rows.
 *
 *   npm run eval                    # all 30, writes evals/results/<date>.json
 *   npm run eval -- --smoke         # the 8 marked smoke (run on prompt PRs)
 *   npm run eval -- --save-baseline # also make this run the baseline
 *   npm run eval -- --compare       # exit 1 if it regressed against evals/baseline.json
 *
 * Costs real Gemini spend: about $0.12 a company at list price.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

process.env.DB_SCHEMA = "eval";

type Golden = { ticker: string; name: string; debt?: boolean; band?: "low" | "not-low"; smoke?: boolean; group: string };
type CaseResult = {
  ticker: string;
  group: string;
  ok: boolean;
  error: string | null;
  seconds: number;
  costUsd: number;
  calls: number;
  retried: boolean;
  nameOk: boolean | null;
  debtOk: boolean | null;
  band: string | null;
  bandOk: boolean | null;
  entities: number;
  proposed: number;
  kept: number;
  memoFallback: boolean | null;
  signal: boolean | null;
  promptHashes: string[];
};
type Summary = {
  at: string;
  cases: number;
  succeeded: number;
  nameAccuracy: number;
  debtRecall: number;
  bandAgreement: number;
  keptRate: number;
  avgEntities: number;
  memoFallbackRate: number;
  signalRate: number;
  medianSeconds: number;
  p95Seconds: number;
  meanCostUsd: number;
  totalCostUsd: number;
  retriedRate: number;
};

const args = new Set(process.argv.slice(2));
const ROOT = path.resolve(__dirname, "..");
const CONCURRENCY = 3;

const quantile = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
const rate = (xs: (boolean | null)[]) => {
  const known = xs.filter((x): x is boolean => x !== null);
  return known.length ? known.filter(Boolean).length / known.length : 1;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

async function main() {
  const { analyzeTicker } = await import("@/lib/analyze");
  const { ensureForecast } = await import("@/lib/forecast-report");
  const { traced, currentTraceId } = await import("@/lib/llm-trace");
  const { migrate, queryRows } = await import("@/lib/tiger");
  await migrate();

  const golden = (JSON.parse(readFileSync(path.join(ROOT, "evals/golden.json"), "utf8")) as { cases: Golden[] }).cases;
  const cases = args.has("--smoke") ? golden.filter((c) => c.smoke) : golden;

  const runOne = traced("eval", async (g: Golden): Promise<CaseResult> => {
    const started = Date.now();
    const trace = currentTraceId();
    const base: CaseResult = { ticker: g.ticker, group: g.group, ok: false, error: null, seconds: 0, costUsd: 0, calls: 0, retried: false, nameOk: null, debtOk: null, band: null, bandOk: null, entities: 0, proposed: 0, kept: 0, memoFallback: null, signal: null, promptHashes: [] };
    try {
      let report = await analyzeTicker(g.ticker, () => undefined);
      report = (await ensureForecast(report)).report;
      const keyRisks = report.memo.sections.find((s) => s.key === "key_risks")?.spans.map((s) => s.text).join("") ?? "";
      const band = report.distress?.band ?? null;
      Object.assign(base, {
        ok: true,
        nameOk: report.graph.company.name.toLowerCase().includes(g.name.toLowerCase()),
        debtOk: g.debt ? (report.capital?.instruments.length ?? 0) > 0 : null,
        band,
        bandOk: g.band && band ? (g.band === "low" ? band === "low" : band !== "low") : null,
        entities: report.graph.nodes.length,
        proposed: report.validation?.proposed ?? 0,
        kept: report.validation?.kept ?? 0,
        memoFallback: keyRisks.startsWith("Highest-severity items: ") || keyRisks === "No high-severity entities were found.",
        signal: Boolean(report.signal?.length),
      });
    } catch (error) {
      base.error = error instanceof Error ? error.message.slice(0, 300) : String(error);
    }
    base.seconds = (Date.now() - started) / 1000;
    if (trace) {
      const [row] = await queryRows<{ cost: number | null; calls: number; retried: boolean; hashes: string[] | null }>(
        "SELECT SUM(cost_usd)::float AS cost, COUNT(*)::int AS calls, BOOL_OR(attempt > 1) AS retried, ARRAY_AGG(DISTINCT task || ':' || prompt_hash) FILTER (WHERE prompt_hash IS NOT NULL) AS hashes FROM llm_calls WHERE trace_id = $1",
        [trace],
      );
      Object.assign(base, { costUsd: row?.cost ?? 0, calls: row?.calls ?? 0, retried: Boolean(row?.retried), promptHashes: row?.hashes ?? [] });
    }
    const flag = (ok: boolean | null) => (ok === null ? "-" : ok ? "ok" : "FAIL");
    console.log(
      `${g.ticker.padEnd(6)} ${base.ok ? "ran " : "ERR "} ${base.seconds.toFixed(0).padStart(4)}s $${base.costUsd.toFixed(3)} name:${flag(base.nameOk)} debt:${flag(base.debtOk)} band:${base.band ?? "-"}(${flag(base.bandOk)}) kept:${base.kept}/${base.proposed} memo:${base.memoFallback ? "FALLBACK" : "ok"}${base.error ? ` ${base.error}` : ""}`,
    );
    return base;
  });

  const results: CaseResult[] = [];
  const queue = [...cases];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let g = queue.shift(); g; g = queue.shift()) results.push(await runOne(g));
    }),
  );
  results.sort((a, b) => cases.findIndex((c) => c.ticker === a.ticker) - cases.findIndex((c) => c.ticker === b.ticker));

  const ran = results.filter((r) => r.ok);
  const summary: Summary = {
    at: new Date().toISOString(),
    cases: results.length,
    succeeded: ran.length,
    nameAccuracy: rate(ran.map((r) => r.nameOk)),
    debtRecall: rate(ran.map((r) => r.debtOk)),
    bandAgreement: rate(ran.map((r) => r.bandOk)),
    keptRate: ran.reduce((a, r) => a + r.kept, 0) / Math.max(1, ran.reduce((a, r) => a + r.proposed, 0)),
    avgEntities: mean(ran.map((r) => r.entities)),
    memoFallbackRate: 1 - rate(ran.map((r) => (r.memoFallback === null ? null : !r.memoFallback))),
    signalRate: rate(ran.map((r) => r.signal)),
    medianSeconds: quantile(results.map((r) => r.seconds), 0.5),
    p95Seconds: quantile(results.map((r) => r.seconds), 0.95),
    meanCostUsd: mean(ran.map((r) => r.costUsd)),
    totalCostUsd: results.reduce((a, r) => a + r.costUsd, 0),
    retriedRate: rate(results.map((r) => r.retried)),
  };

  const dir = path.join(ROOT, "evals/results");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${summary.at.slice(0, 16).replace(/[:T]/g, "-")}${args.has("--smoke") ? "-smoke" : ""}.json`);
  writeFileSync(file, `${JSON.stringify({ summary, results }, null, 2)}\n`);
  console.log(`\n${JSON.stringify(summary, null, 2)}\nWrote ${path.relative(ROOT, file)}`);

  const baselinePath = path.join(ROOT, "evals/baseline.json");
  if (args.has("--save-baseline")) writeFileSync(baselinePath, `${JSON.stringify({ summary, results }, null, 2)}\n`);

  if (args.has("--compare") && existsSync(baselinePath)) {
    const base = (JSON.parse(readFileSync(baselinePath, "utf8")) as { summary: Summary }).summary;
    // Rates are compared on the cases that ran; one case either way is noise at n=8 or 30, so the slack is one case's share.
    const slack = 1 / Math.max(1, ran.length);
    const checks: [string, boolean][] = [
      ["success rate", summary.succeeded / summary.cases >= base.succeeded / base.cases - slack],
      ["name accuracy", summary.nameAccuracy >= base.nameAccuracy - slack],
      ["debt recall", summary.debtRecall >= base.debtRecall - slack],
      ["band agreement", summary.bandAgreement >= base.bandAgreement - slack],
      ["kept rate", summary.keptRate >= base.keptRate - 0.05],
      ["memo fallback rate", summary.memoFallbackRate <= base.memoFallbackRate + slack],
      ["signal rate", summary.signalRate >= base.signalRate - slack],
      ["mean cost", summary.meanCostUsd <= base.meanCostUsd * 1.3],
    ];
    for (const [name, ok] of checks) console.log(`${ok ? "pass" : "FAIL"}  ${name}`);
    if (checks.some(([, ok]) => !ok)) process.exit(1);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
