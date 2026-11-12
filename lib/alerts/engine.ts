import type { BookEvent } from "../stream/polymarket";
import { MAD_TO_SIGMA, calculateMAD, median, robustZ } from "../stream/robust";
import { RollingWindow } from "../stream/rolling-window";
import { type AlertRule, type Clause, EVENT_HOLD_MS, type Metric } from "./predicate";

/**
 * Runs one compiled rule on the stream. Deterministic and model-free: the
 * same samples and fills give the same fires. Each clause keeps only the
 * state its test needs (a ring buffer, a CUSUM sum, a short price history),
 * so a one-second sample costs O(window) at worst, for the median in the
 * robust tests, and O(1) for level, change and the CUSUM update itself.
 */

export interface StreamSample {
  t: number;
  bid: number | null;
  ask: number | null;
  mid: number | null;
  imbalance: number | null;
}

export interface RuleFire {
  t: number;
  rule: string;
  text: string;
  /** Wall-clock time to evaluate the sample that fired, in milliseconds. */
  evalMs: number;
  /** The mid when it fired, and the way the rule says the price is going (null when it says nothing about price). */
  midAtFire: number | null;
  direction: "up" | "down" | null;
  /** Five minutes on: reversed if the mid had moved against the rule's direction by more than half a cent, else held. Null until known, or with no direction. */
  outcome: "held" | "reversed" | null;
}

/** Minimum history before a statistical test may be true. */
const WARMUP = 30;
const OUTCOME_MS = 5 * 60_000;
/** Floors on the robust spread, so a metric that sits still does not make every tiny step look huge. */
const STEP_FLOOR: Record<Metric, number> = { mid: 0.0005, spread: 0.0005, imbalance: 0.005, trade_rate: 0.5, trade_size: 0 };
const LEVEL_FLOOR: Record<Metric, number> = { mid: 0.002, spread: 0.002, imbalance: 0.02, trade_rate: 1, trade_size: 0.5 };
const DRIFT_K = 0.5;
const REVERSAL = 0.005;

/** The direction a rule claims for the price, from its first clause on the mid. */
function priceDirection(rule: AlertRule): "up" | "down" | null {
  const t = rule.clauses.find((c) => c.metric === "mid")?.test;
  if (!t) return null;
  if (t.kind === "level") return t.op === "above" ? "up" : "down";
  return t.direction === "up" || t.direction === "down" ? t.direction : null;
}

class ClauseState {
  /** Values for outlier tests, steps for drift (log size for trade_size). */
  private readonly hist: RollingWindow | null;
  /** The last hour of one-second values, for change tests. */
  private readonly past: (number | null)[] = [];
  private cusum = 0;
  private last: number | null = null;
  private lastEventT = -Infinity;
  value: number | null = null;
  holds = false;

  constructor(readonly clause: Clause) {
    const t = clause.test;
    this.hist = t.kind === "drift" || t.kind === "outlier" ? new RollingWindow(t.window) : null;
  }

  /** A fill, for trade_size clauses: true for EVENT_HOLD_MS after a fill that passes. */
  onTrade(size: number, t: number): void {
    if (this.clause.metric !== "trade_size") return;
    const test = this.clause.test;
    let pass = false;
    if (test.kind === "level") pass = test.op === "above" ? size > test.value : size < test.value;
    if (test.kind === "outlier" && this.hist) {
      const x = Math.log1p(size);
      const h = this.hist.values();
      if (h.length >= WARMUP) {
        const z = robustZ(x, h, LEVEL_FLOOR.trade_size);
        pass = test.direction === "up" ? z > test.z : test.direction === "down" ? z < -test.z : Math.abs(z) > test.z;
      }
      this.hist.push(x);
    }
    this.value = size;
    if (pass) this.lastEventT = t;
  }

  onSample(x: number | null, t: number): void {
    const test = this.clause.test;
    if (this.clause.metric === "trade_size") {
      this.holds = t - this.lastEventT <= EVENT_HOLD_MS;
      return;
    }
    this.value = x;
    if (x === null) {
      this.holds = false;
      return;
    }
    switch (test.kind) {
      case "level":
        this.holds = test.op === "above" ? x > test.value : x < test.value;
        break;
      case "change": {
        this.past.push(x);
        if (this.past.length > 3601) this.past.shift();
        const then = this.past.length > test.seconds ? this.past[this.past.length - 1 - test.seconds] : null;
        this.holds = then !== null && (test.direction === "up" ? x - then >= test.amount - 1e-12 : then - x >= test.amount - 1e-12);
        break;
      }
      case "drift": {
        const h = this.hist as RollingWindow;
        if (this.last !== null) {
          const step = x - this.last;
          const steps = h.values();
          if (steps.length >= WARMUP) {
            const scale = Math.max(calculateMAD(steps, median(steps)) * MAD_TO_SIGMA, STEP_FLOOR[this.clause.metric]);
            const z = (test.direction === "up" ? step : -step) / scale;
            this.cusum = Math.max(0, this.cusum + z - DRIFT_K);
          }
          h.push(step);
        }
        this.holds = this.cusum > test.h;
        break;
      }
      case "outlier": {
        const h = this.hist as RollingWindow;
        const vals = h.values();
        let pass = false;
        if (vals.length >= WARMUP) {
          const z = robustZ(x, vals, LEVEL_FLOOR[this.clause.metric]);
          pass = test.direction === "up" ? z > test.z : test.direction === "down" ? z < -test.z : Math.abs(z) > test.z;
        }
        h.push(x);
        this.holds = pass;
        break;
      }
    }
    this.last = x;
  }
}

export class RuleRunner {
  private readonly clauses: ClauseState[];
  private readonly fills: number[] = [];
  private streak = 0;
  private lastFire = -Infinity;
  readonly fires: RuleFire[] = [];

  constructor(readonly rule: AlertRule) {
    this.clauses = rule.clauses.map((c) => new ClauseState(c));
  }

  onEvent(e: BookEvent): void {
    if (e.kind !== "trade") return;
    this.fills.push(e.t);
    for (const c of this.clauses) c.onTrade(e.size, e.t);
  }

  /** Evaluates one one-second sample; returns a fire when the rule has held long enough and is not cooling down. */
  onSample(s: StreamSample): RuleFire | null {
    const started = typeof performance !== "undefined" ? performance.now() : Date.now();
    while (this.fills.length && this.fills[0] < s.t - 60_000) this.fills.shift();
    const metric = (m: Metric): number | null =>
      m === "mid" ? s.mid : m === "spread" ? (s.bid !== null && s.ask !== null ? s.ask - s.bid : null) : m === "imbalance" ? s.imbalance : m === "trade_rate" ? this.fills.length : null;
    for (const c of this.clauses) c.onSample(metric(c.clause.metric), s.t);
    this.settle(s);
    if (this.clauses.every((c) => c.holds)) {
      this.streak++;
    } else {
      this.streak = 0;
    }
    if (this.streak < this.rule.persistence || s.t - this.lastFire < this.rule.cooldownSec * 1000) return null;
    this.lastFire = s.t;
    this.streak = 0;
    const ended = typeof performance !== "undefined" ? performance.now() : Date.now();
    const fire: RuleFire = {
      t: s.t,
      rule: this.rule.name,
      text: this.clauses.map((c) => `${c.clause.metric} ${c.value === null ? "n/a" : +c.value.toFixed(4)}`).join(", "),
      evalMs: ended - started,
      midAtFire: s.mid,
      direction: priceDirection(this.rule),
      outcome: null,
    };
    this.fires.push(fire);
    return fire;
  }

  /** Five minutes after a fire: did the price turn against what the rule said? */
  private settle(s: StreamSample): void {
    for (const f of this.fires) {
      if (f.outcome || !f.direction || f.midAtFire === null || s.mid === null || s.t - f.t < OUTCOME_MS) continue;
      const against = f.direction === "up" ? f.midAtFire - s.mid : s.mid - f.midAtFire;
      f.outcome = against > REVERSAL ? "reversed" : "held";
    }
  }

  /** What each clause sees now, for the panel. */
  status(): { holds: boolean; value: number | null }[] {
    return this.clauses.map((c) => ({ holds: c.holds, value: c.value }));
  }

  get progress(): number {
    return this.streak;
  }
}
