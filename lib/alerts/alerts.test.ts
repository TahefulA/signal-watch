import assert from "node:assert/strict";
import { test } from "node:test";
import { RuleRunner, type StreamSample } from "./engine";
import { type AlertRule, validate } from "./predicate";

const sample = (t: number, mid: number | null, extra: Partial<StreamSample> = {}): StreamSample => ({ t: t * 1000, bid: mid === null ? null : mid - 0.005, ask: mid === null ? null : mid + 0.005, mid, imbalance: 0, ...extra });
const rule = (r: Partial<AlertRule>): AlertRule => ({ name: "test", clauses: [], persistence: 1, cooldownSec: 60, ...r });

/** Deterministic noise, so the test cannot flake. */
function lcg(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32) - 0.5;
}

test("validate accepts a sound rule and names each problem in a bad one", () => {
  assert.deepEqual(validate(rule({ clauses: [{ metric: "mid", test: { kind: "level", op: "above", value: 0.6 } }] })), []);
  const errors = validate(rule({
    persistence: 0,
    clauses: [
      { metric: "trade_size", test: { kind: "drift", direction: "up", h: 5, window: 300 } },
      { metric: "mid", test: { kind: "level", op: "above", value: 63 } },
      { metric: "imbalance", test: { kind: "outlier", direction: "up", z: 3.5, window: 5 } },
    ],
  }));
  assert.ok(errors.some((e) => e.includes("persistence")));
  assert.ok(errors.some((e) => e.includes("trade_size is per fill")));
  assert.ok(errors.some((e) => e.includes("value for mid")));
  assert.ok(errors.some((e) => e.includes("window")));
});

test("persistence: one-tick wicks never fire; a condition that holds does", () => {
  const r = new RuleRunner(rule({ persistence: 3, clauses: [{ metric: "mid", test: { kind: "level", op: "above", value: 0.6 } }] }));
  const mids = [0.5, 0.61, 0.5, 0.62, 0.5, 0.61, 0.61, 0.5, 0.61, 0.61, 0.61];
  const fired = mids.map((m, i) => r.onSample(sample(i, m))).map((f, i) => (f ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(fired, [10]);
});

test("change: a 3-cent rise within 10 seconds fires once, then the cooldown holds", () => {
  const r = new RuleRunner(rule({ cooldownSec: 600, clauses: [{ metric: "mid", test: { kind: "change", direction: "up", amount: 0.03, seconds: 10 } }] }));
  const fired: number[] = [];
  for (let i = 0; i < 60; i++) if (r.onSample(sample(i, 0.5 + (i >= 20 ? Math.min(i - 20, 10) * 0.004 : 0)))) fired.push(i);
  assert.deepEqual(fired, [28]);
});

test("drift: quiet on noise, fires on a sustained trend in its direction only", () => {
  const noise = lcg(7);
  const up = new RuleRunner(rule({ persistence: 2, clauses: [{ metric: "mid", test: { kind: "drift", direction: "up", h: 5, window: 120 } }] }));
  const down = new RuleRunner(rule({ persistence: 2, clauses: [{ metric: "mid", test: { kind: "drift", direction: "down", h: 5, window: 120 } }] }));
  let mid = 0.5;
  const firedUp: number[] = [];
  let firedDown = 0;
  for (let i = 0; i < 600; i++) {
    mid += noise() * 0.004 + (i >= 400 ? 0.002 : 0);
    if (up.onSample(sample(i, mid))) firedUp.push(i);
    if (down.onSample(sample(i, mid))) firedDown++;
  }
  assert.ok(firedUp.length >= 1 && firedUp[0] >= 400 && firedUp[0] < 440, `fired at ${firedUp}`);
  assert.equal(firedDown, 0);
});

test("a big fill keeps its clause true for a minute, so it can meet a book condition", () => {
  const r = new RuleRunner(rule({ clauses: [{ metric: "trade_size", test: { kind: "level", op: "above", value: 5000 } }, { metric: "mid", test: { kind: "level", op: "above", value: 0.6 } }] }));
  r.onEvent({ kind: "trade", t: 10_000, price: 0.55, size: 9000, side: "buy" });
  assert.equal(r.onSample(sample(11, 0.55)), null);
  assert.ok(r.onSample(sample(40, 0.62)));
  assert.equal(new RuleRunner(r.rule).onSample(sample(80, 0.62)), null);
});
