import assert from "node:assert/strict";
import { test } from "node:test";
import { CUSUMDetector } from "./cusum";
import { calculateMAD, median, robustZ } from "./robust";
import { RollingMedian } from "./rolling-median";
import { RollingWindow } from "./rolling-window";

/** Deterministic pseudo-random numbers, so a failure reproduces. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

test("rolling mean and variance match a brute-force window", () => {
  const r = rng(1);
  const w = new RollingWindow(50);
  const all: number[] = [];
  for (let i = 0; i < 25_000; i++) {
    const v = (r() - 0.5) * 1e6 + 1e9;
    w.push(v);
    all.push(v);
    if (i % 997 !== 0) continue;
    const win = all.slice(-50);
    const mean = win.reduce((a, b) => a + b, 0) / win.length;
    const variance = win.reduce((a, b) => a + (b - mean) ** 2, 0) / (win.length - 1 || 1);
    assert.ok(Math.abs(w.mean() - mean) < 1e-3, `mean at ${i}`);
    if (win.length > 1) assert.ok(Math.abs(w.variance() - variance) / variance < 1e-6, `variance at ${i}`);
  }
});

test("rolling median matches sorting the window, with duplicates and ties", () => {
  for (const size of [1, 2, 3, 10, 64]) {
    const r = rng(size);
    const m = new RollingMedian(size);
    const all: number[] = [];
    for (let i = 0; i < 5_000; i++) {
      // Few distinct values, so ties and lazy deletions of equal values are exercised.
      const v = Math.floor(r() * 7) * (r() < 0.1 ? 1000 : 1);
      m.push(v);
      all.push(v);
      assert.equal(m.median(), median(all.slice(-size)), `size ${size}, step ${i}`);
    }
  }
});

test("MAD ignores one huge outlier that a standard deviation does not", () => {
  const values = [10, 11, 9, 10, 12, 10, 9, 11, 10, 10_000];
  assert.equal(median(values), 10);
  assert.equal(calculateMAD(values), 1);
  assert.ok(robustZ(10_000, values.slice(0, 9)) > 1000);
  assert.ok(Math.abs(robustZ(11, values)) < 3.5);
});

test("robust z falls back when more than half the window is one value", () => {
  const values = [100, 100, 100, 100, 100, 100, 250, 90];
  assert.equal(calculateMAD(values), 0);
  assert.ok(Number.isFinite(robustZ(5_000, values)) && robustZ(5_000, values) > 3.5);
  assert.equal(robustZ(5, [5, 5, 5]), 0);
  assert.equal(robustZ(6, [5, 5, 5]), Infinity);
});

test("CUSUM stays quiet on noise and catches a one-sigma shift within twenty steps", () => {
  const r = rng(7);
  const normal = () => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
  const c = new CUSUMDetector(5, 0.5);
  let alarms = 0;
  for (let i = 0; i < 2_000; i++) if (c.update(normal())) alarms++;
  // Expected about 2000 / 465 for a two-sided k = 0.5, h = 5 chart.
  assert.ok(alarms <= 12, `${alarms} false alarms`);
  c.reset();
  let at = -1;
  for (let i = 0; i < 100 && at < 0; i++) if (c.update(normal() + 1) === "up") at = i;
  assert.ok(at >= 0 && at < 20, `detected at ${at}`);
});

test("a bot filling one size does not make ordinary fills look extreme", () => {
  const sizes = [...Array(120).fill(50), ...Array(80).fill(0).map((_, i) => 30 + (i % 40))];
  const logs = sizes.map((s) => Math.log1p(s));
  assert.ok(robustZ(Math.log1p(300), logs, 0.5) < 3.5, "6x the usual size is not an outlier");
  assert.ok(robustZ(Math.log1p(2_000), logs, 0.5) > 3.5, "40x the usual size is");
});
