/**
 * Evaluates the live-question compiler. Twenty questions a trader might ask,
 * each with what a correct rule must contain (or that it must be refused).
 * Each compiled rule is then run on every recorded session in public/replays,
 * exactly as the Lab runs it, to count fires, how many the market reversed
 * within five minutes, and the per-sample evaluation time.
 *
 *   npx tsx --env-file=.env.local scripts/eval-alert-compiler.ts
 *
 * Writes model/alert-compiler-eval.json.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { compileQuestion } from "@/lib/alerts/compiler";
import { RuleRunner } from "@/lib/alerts/engine";
import { type AlertRule, type Metric, describe } from "@/lib/alerts/predicate";
import { OrderBook } from "@/lib/stream/order-book";
import type { BookEvent } from "@/lib/stream/polymarket";

interface Case {
  question: string;
  /** Each [metric, test kind, direction?] must appear among the clauses. */
  expect?: [Metric, string, string?][];
  unsupported?: boolean;
}

const CASES: Case[] = [
  { question: "Alert me if the price rises above 70 cents", expect: [["mid", "level", "above"]] },
  { question: "Tell me when the YES price drops below 40%", expect: [["mid", "level", "below"]] },
  { question: "Tell me if the probability starts falling sharply", expect: [["mid", "change", "down"]] },
  { question: "Alert when the price moves up 5 cents within 10 minutes", expect: [["mid", "change", "up"]] },
  { question: "Let me know if the odds start drifting up", expect: [["mid", "drift", "up"]] },
  { question: "Warn me about a sustained downward trend in price", expect: [["mid", "drift", "down"]] },
  { question: "Alert me on any unusually large trade", expect: [["trade_size", "outlier", "up"]] },
  { question: "Notify me if someone fills more than 20,000 shares", expect: [["trade_size", "level", "above"]] },
  { question: "Alert if the spread widens beyond 5 cents", expect: [["spread", "level", "above"]] },
  { question: "Tell me when the book gets heavily bid, imbalance over 0.6", expect: [["imbalance", "level", "above"]] },
  { question: "Alert me if the bids thin out sharply relative to normal", expect: [["imbalance", "outlier", "down"]] },
  { question: "Tell me if trading activity spikes to more than 20 trades a minute", expect: [["trade_rate", "level", "above"]] },
  { question: "Alert me if the price is drifting down while the spread stays tight", expect: [["mid", "drift", "down"], ["spread", "level", "below"]] },
  { question: "Tell me if a whale buys and the price jumps 3 cents in 5 minutes", expect: [["trade_size", "outlier", "up"], ["mid", "change", "up"]] },
  { question: "Notify me if the price climbs above 0.55 and the book leans to buyers", expect: [["mid", "level", "above"], ["imbalance", "level", "above"]] },
  { question: "Alert me when there's abnormal trading volume", expect: [["trade_rate", "outlier", "up"]] },
  { question: "Tell me if the Fed rate odds drift up while tech bond spreads widen", unsupported: true },
  { question: "Alert me when Reuters publishes news about this market", unsupported: true },
  { question: "Tell me if Apple stock falls 5% today", unsupported: true },
  { question: "Alert me at 9:30am every day with the price", unsupported: true },
];

function matches(rule: AlertRule, expect: [Metric, string, string?][]): boolean {
  return expect.every(([metric, kind, dir]) =>
    rule.clauses.some((c) => {
      if (c.metric !== metric || c.test.kind !== kind) return false;
      if (!dir) return true;
      const t = c.test as { op?: string; direction?: string };
      return t.op === dir || t.direction === dir;
    }),
  );
}

function runOnReplay(rule: AlertRule, events: BookEvent[]) {
  const runner = new RuleRunner(rule);
  const book = new OrderBook();
  let i = 0;
  let evalMs = 0;
  let samples = 0;
  const end = events[events.length - 1].t + 5 * 60_000;
  for (let t = Math.ceil(events[0].t / 1000) * 1000; t <= end; t += 1000) {
    while (i < events.length && events[i].t <= t) {
      book.apply(events[i]);
      runner.onEvent(events[i++]);
    }
    const s0 = performance.now();
    runner.onSample({ t, bid: book.bestBid(), ask: book.bestAsk(), mid: book.mid(), imbalance: book.imbalance() });
    evalMs += performance.now() - s0;
    samples++;
  }
  const f = runner.fires;
  return { fires: f.length, held: f.filter((x) => x.outcome === "held").length, reversed: f.filter((x) => x.outcome === "reversed").length, meanEvalUs: +((evalMs / samples) * 1000).toFixed(2) };
}

(async () => {
  const dir = path.join(process.cwd(), "public/replays");
  const replays = readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f !== "index.json")
    .map((f) => ({ file: f, events: (JSON.parse(readFileSync(path.join(dir, f), "utf8")) as { events: BookEvent[] }).events.sort((a, b) => a.t - b.t) }));
  const results = [];
  for (const c of CASES) {
    const r = await compileQuestion(c.question).catch((e: unknown) => ({ ok: false as const, unsupported: false, reason: String(e), errors: [], attempts: 0, ms: 0 }));
    const correct = c.unsupported ? !r.ok && r.unsupported : r.ok && matches(r.rule, c.expect ?? []);
    const row = {
      question: c.question,
      expected: c.unsupported ? "refuse" : (c.expect ?? []).map((e) => e.join(" ")).join(" AND "),
      ok: r.ok,
      correct,
      attempts: r.attempts,
      ms: r.ms,
      rule: r.ok ? r.rule : null,
      description: r.ok ? describe(r.rule) : null,
      refusal: r.ok ? null : r.reason,
      replay: r.ok ? replays.map((p) => ({ file: p.file, ...runOnReplay(r.rule, p.events) })) : [],
    };
    results.push(row);
    console.log(correct ? "PASS" : "FAIL", `(${r.attempts} try, ${r.ms} ms)`, c.question, "\n   ", row.description ?? row.refusal);
  }
  const compilable = results.filter((r) => !CASES.find((c) => c.question === r.question)?.unsupported);
  const refusals = results.filter((r) => CASES.find((c) => c.question === r.question)?.unsupported);
  const fires = results.flatMap((r) => r.replay);
  const summary = {
    ranAt: new Date().toISOString(),
    cases: results.length,
    correct: results.filter((r) => r.correct).length,
    compiledValid: compilable.filter((r) => r.ok).length,
    compilable: compilable.length,
    refusedCorrectly: refusals.filter((r) => r.correct).length,
    refusals: refusals.length,
    retried: results.filter((r) => r.attempts > 1).length,
    medianCompileMs: [...results.map((r) => r.ms)].sort((a, b) => a - b)[Math.floor(results.length / 2)],
    replayFires: fires.reduce((s, x) => s + x.fires, 0),
    replayHeld: fires.reduce((s, x) => s + x.held, 0),
    replayReversed: fires.reduce((s, x) => s + x.reversed, 0),
    meanEvalUs: +(fires.reduce((s, x) => s + x.meanEvalUs, 0) / (fires.length || 1)).toFixed(2),
  };
  console.log(summary);
  writeFileSync(path.join(process.cwd(), "model/alert-compiler-eval.json"), `${JSON.stringify({ summary, results }, null, 2)}\n`);
  process.exit(0);
})();
