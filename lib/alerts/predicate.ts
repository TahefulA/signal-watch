/**
 * The alert language. A "live question" in plain English is compiled once, by
 * the model, into an AlertRule; from then on only this code runs it, against
 * every sample and fill. The model never sees the stream, so it cannot
 * hallucinate a number into an alert, and a rule that fails validate() never
 * runs.
 *
 * A rule is up to three clauses joined by AND, each one metric and one test,
 * and must hold for `persistence` consecutive one-second samples before it
 * fires, so a single-tick wick does not count.
 */

/**
 * mid: the YES price, halfway between best bid and best ask (0 to 1).
 * spread: best ask minus best bid (0 to 1).
 * imbalance: near-touch depth, (bids - asks) / (bids + asks), -1 to 1.
 * trade_size: shares in each fill; an event, so a fill keeps its clause true for EVENT_HOLD_MS.
 * trade_rate: fills in the last 60 seconds.
 */
export type Metric = "mid" | "spread" | "imbalance" | "trade_size" | "trade_rate";

/**
 * level: the metric above or below a fixed value.
 * change: the metric moved by at least `amount` over the last `seconds`.
 * drift: one-sided CUSUM on the metric's steps, standardised by their robust spread over `window` samples; true while the sum is past h.
 * outlier: modified z-score against the last `window` values, past z.
 */
export type Test =
  | { kind: "level"; op: "above" | "below"; value: number }
  | { kind: "change"; direction: "up" | "down"; amount: number; seconds: number }
  | { kind: "drift"; direction: "up" | "down"; h: number; window: number }
  | { kind: "outlier"; direction: "up" | "down" | "either"; z: number; window: number };

export interface Clause {
  metric: Metric;
  test: Test;
}

export interface AlertRule {
  name: string;
  clauses: Clause[];
  /** Consecutive one-second samples every clause must hold. */
  persistence: number;
  /** Seconds after firing before the rule may fire again. */
  cooldownSec: number;
}

export const METRICS: Metric[] = ["mid", "spread", "imbalance", "trade_size", "trade_rate"];
export const EVENT_HOLD_MS = 60_000;

const RANGE: Record<Metric, { min: number; max: number; maxChange: number }> = {
  mid: { min: 0, max: 1, maxChange: 1 },
  spread: { min: 0, max: 1, maxChange: 1 },
  imbalance: { min: -1, max: 1, maxChange: 2 },
  trade_size: { min: 0, max: 10_000_000, maxChange: 0 },
  trade_rate: { min: 0, max: 10_000, maxChange: 10_000 },
};

const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const within = (x: unknown, lo: number, hi: number): x is number => finite(x) && x >= lo && x <= hi;

/** Every reason the rule cannot run; empty when it can. */
export function validate(rule: AlertRule): string[] {
  const errors: string[] = [];
  if (!rule || typeof rule !== "object") return ["Not a rule."];
  if (typeof rule.name !== "string" || !rule.name.trim() || rule.name.length > 80) errors.push("name must be 1 to 80 characters.");
  if (!Array.isArray(rule.clauses) || rule.clauses.length < 1 || rule.clauses.length > 3) errors.push("clauses must hold 1 to 3 clauses.");
  if (!within(rule.persistence, 1, 120) || !Number.isInteger(rule.persistence)) errors.push("persistence must be a whole number of seconds from 1 to 120.");
  if (!within(rule.cooldownSec, 10, 3600)) errors.push("cooldownSec must be 10 to 3600.");
  (Array.isArray(rule.clauses) ? rule.clauses : []).forEach((c, i) => {
    const at = `clause ${i + 1}`;
    if (!METRICS.includes(c?.metric)) {
      errors.push(`${at}: metric must be one of ${METRICS.join(", ")}.`);
      return;
    }
    const r = RANGE[c.metric];
    const t = c.test;
    if (!t || typeof t !== "object") {
      errors.push(`${at}: missing test.`);
      return;
    }
    if (c.metric === "trade_size" && t.kind !== "level" && t.kind !== "outlier") errors.push(`${at}: trade_size is per fill, so only level and outlier apply.`);
    switch (t.kind) {
      case "level":
        if (t.op !== "above" && t.op !== "below") errors.push(`${at}: op must be above or below.`);
        if (!within(t.value, r.min, r.max)) errors.push(`${at}: value for ${c.metric} must be ${r.min} to ${r.max}.`);
        break;
      case "change":
        if (t.direction !== "up" && t.direction !== "down") errors.push(`${at}: direction must be up or down.`);
        if (!within(t.amount, 0, r.maxChange) || t.amount <= 0) errors.push(`${at}: amount for ${c.metric} must be above 0 and at most ${r.maxChange}.`);
        if (!within(t.seconds, 5, 3600)) errors.push(`${at}: seconds must be 5 to 3600.`);
        break;
      case "drift":
        if (t.direction !== "up" && t.direction !== "down") errors.push(`${at}: direction must be up or down.`);
        if (!within(t.h, 2, 20)) errors.push(`${at}: h must be 2 to 20.`);
        if (!within(t.window, 30, 600) || !Number.isInteger(t.window)) errors.push(`${at}: window must be a whole number from 30 to 600.`);
        break;
      case "outlier":
        if (t.direction !== "up" && t.direction !== "down" && t.direction !== "either") errors.push(`${at}: direction must be up, down or either.`);
        if (!within(t.z, 2, 10)) errors.push(`${at}: z must be 2 to 10.`);
        if (!within(t.window, 30, 600) || !Number.isInteger(t.window)) errors.push(`${at}: window must be a whole number from 30 to 600.`);
        break;
      default:
        errors.push(`${at}: test kind must be level, change, drift or outlier.`);
    }
  });
  return errors;
}

const LABEL: Record<Metric, string> = { mid: "the price", spread: "the spread", imbalance: "the book imbalance", trade_size: "a fill's size", trade_rate: "fills per minute" };

function amount(metric: Metric, v: number): string {
  if (metric === "mid" || metric === "spread") return `${+(v * 100).toFixed(2)}¢`;
  if (metric === "imbalance") return v.toFixed(2);
  return v.toLocaleString("en-US");
}

/** The rule read back in English, by code, so what runs is exactly what the reader sees. */
export function describeClause(c: Clause): string {
  const t = c.test;
  const m = LABEL[c.metric];
  switch (t.kind) {
    case "level":
      return `${m} is ${t.op} ${amount(c.metric, t.value)}`;
    case "change":
      return `${m} has ${t.direction === "up" ? "risen" : "fallen"} at least ${amount(c.metric, t.amount)} in ${t.seconds < 120 ? `${t.seconds} seconds` : `${+(t.seconds / 60).toFixed(1)} minutes`}`;
    case "drift":
      return `${m} is drifting ${t.direction} beyond normal noise (CUSUM past ${t.h}, noise from the last ${t.window} samples)`;
    case "outlier":
      return `${m} is unusually ${t.direction === "up" ? "high" : t.direction === "down" ? "low" : "far from normal"} (robust z past ${t.z} against the last ${t.window})`;
  }
}

export function describe(rule: AlertRule): string {
  return `Fires when ${rule.clauses.map(describeClause).join(", and ")}, held for ${rule.persistence} second${rule.persistence === 1 ? "" : "s"}; then quiet for ${rule.cooldownSec} seconds.`;
}
