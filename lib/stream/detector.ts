import { CUSUMDetector, type CusumSignal } from "./cusum";
import { OrderBook } from "./order-book";
import type { BookEvent } from "./polymarket";
import { robustZ, OUTLIER_Z, calculateMAD, median, MAD_TO_SIGMA } from "./robust";
import { RollingMedian } from "./rolling-median";
import { RollingWindow } from "./rolling-window";

/**
 * Unusual activity in one order book, from the feed alone. Deterministic: the
 * same events in the same order give the same alerts, so a recorded session
 * replays exactly.
 *
 * - Large trade: a fill's size against the last 200 fills, by modified z-score
 *   (median and MAD), above 3.5.
 * - Sustained move: the mid sampled once a second; each change is
 *   standardised by the robust spread of the last 300 changes and fed to a
 *   two-sided CUSUM.
 * - Depth shift: near-touch imbalance against its last 300 samples, by
 *   modified z-score.
 * - Large trade and sustained move within a minute of each other, the same
 *   way: unusual activity worth a look. It is not proof of informed trading;
 *   news, a rebalance or one big player look the same.
 */

export type AlertKind = "large_trade" | "sustained_move" | "depth_shift" | "combined";

export interface Alert {
  t: number;
  kind: AlertKind;
  text: string;
  z?: number;
  direction?: "up" | "down";
}

export interface Sample {
  t: number;
  bid: number | null;
  ask: number | null;
  mid: number | null;
  imbalance: number | null;
}

export interface DetectorStats {
  trades: number;
  meanSize: number;
  medianSize: number;
  stdSize: number;
  madSize: number;
  imbalance: number | null;
  cusum: { pos: number; neg: number; threshold: number };
  lastSignal: CusumSignal;
}

const TRADE_WINDOW = 200;
const SAMPLE_WINDOW = 300;
const WARMUP_TRADES = 30;
const WARMUP_SAMPLES = 60;
const COMBINE_MS = 60_000;
/** Imbalance is sampled every second, so neighbouring samples are close to each other; a higher bar than for independent fills. */
const DEPTH_Z = 5;
/** One alert of a kind per this long, so a burst reads as one event. */
const QUIET_MS = 20_000;

const money = (v: number) => (v >= 1_000 ? `${(v / 1_000).toFixed(1)}k` : v.toFixed(0));
const cents = (p: number) => `${(p * 100).toFixed(1)}¢`;

export class MicrostructureDetector {
  readonly book = new OrderBook();
  private readonly sizes = new RollingWindow(TRADE_WINDOW);
  private readonly sizeMedian = new RollingMedian(TRADE_WINDOW);
  private readonly moves = new RollingWindow(SAMPLE_WINDOW);
  private readonly imbalances = new RollingWindow(SAMPLE_WINDOW);
  private readonly cusum = new CUSUMDetector(5, 0.5);
  private lastMid: number | null = null;
  private lastSignal: CusumSignal = null;
  private lastAlert: Partial<Record<AlertKind, number>> = {};
  private lastLargeTrade: { t: number; side: "buy" | "sell" } | null = null;
  private lastMove: { t: number; direction: "up" | "down" } | null = null;
  private tradeCount = 0;

  /** Warms the trade-size window with fills from before the session; they raise no alerts. */
  seed(trades: BookEvent[]): void {
    for (const e of trades) {
      if (e.kind !== "trade") continue;
      this.sizes.push(e.size);
      this.sizeMedian.push(e.size);
    }
  }

  /** Applies one feed event; a fill can raise an alert. */
  onEvent(e: BookEvent): Alert[] {
    this.book.apply(e);
    if (e.kind !== "trade") return [];
    const out: Alert[] = [];
    const history = this.sizes.values();
    this.tradeCount++;
    if (history.length >= WARMUP_TRADES) {
      const z = robustZ(e.size, history);
      if (z > OUTLIER_Z && this.quiet("large_trade", e.t)) {
        out.push({ t: e.t, kind: "large_trade", z, text: `Large ${e.side}: ${money(e.size)} shares at ${cents(e.price)}, z ${z.toFixed(1)} against the last ${history.length} fills` });
        this.lastLargeTrade = { t: e.t, side: e.side };
        out.push(...this.combine(e.t));
      }
    }
    this.sizes.push(e.size);
    this.sizeMedian.push(e.size);
    return out;
  }

  /** Samples the book once a second: the mid's move feeds the CUSUM, imbalance is checked against its own history. */
  sample(t: number): { sample: Sample; alerts: Alert[] } {
    const out: Alert[] = [];
    const mid = this.book.mid();
    const imbalance = this.book.imbalance();
    if (mid !== null && this.lastMid !== null) {
      const step = mid - this.lastMid;
      const history = this.moves.values();
      if (history.length >= WARMUP_SAMPLES) {
        // Most seconds the mid does not move, so the MAD of moves is often zero; the floor is half a tick.
        const scale = Math.max(calculateMAD(history, median(history)) * MAD_TO_SIGMA, 0.0005);
        const signal = this.cusum.update(step / scale);
        if (signal) {
          this.lastSignal = signal;
          if (this.quiet("sustained_move", t)) {
            out.push({ t, kind: "sustained_move", direction: signal, text: `Sustained move ${signal}: the mid has drifted ${signal === "up" ? "up" : "down"} to ${cents(mid)}, beyond normal noise (CUSUM past ${this.cusum.threshold})` });
            this.lastMove = { t, direction: signal };
            out.push(...this.combine(t));
          }
        }
      }
      this.moves.push(step);
    }
    if (mid !== null) this.lastMid = mid;
    if (imbalance !== null) {
      const history = this.imbalances.values();
      if (history.length >= WARMUP_SAMPLES) {
        const z = robustZ(imbalance, history);
        if (Math.abs(z) > DEPTH_Z && this.quiet("depth_shift", t)) {
          out.push({ t, kind: "depth_shift", z, text: `Depth shift: near-touch book now ${imbalance > 0 ? "bid" : "offer"}-heavy (imbalance ${imbalance.toFixed(2)}, z ${z.toFixed(1)})` });
        }
      }
      this.imbalances.push(imbalance);
    }
    return { sample: { t, bid: this.book.bestBid(), ask: this.book.bestAsk(), mid, imbalance }, alerts: out };
  }

  stats(): DetectorStats {
    return {
      trades: this.tradeCount,
      meanSize: this.sizes.mean(),
      medianSize: this.sizeMedian.median(),
      stdSize: this.sizes.std(),
      madSize: this.sizes.length ? calculateMAD(this.sizes.values()) : NaN,
      imbalance: this.book.imbalance(),
      cusum: this.cusum.state,
      lastSignal: this.lastSignal,
    };
  }

  private quiet(kind: AlertKind, t: number): boolean {
    if (t - (this.lastAlert[kind] ?? -Infinity) < QUIET_MS) return false;
    this.lastAlert[kind] = t;
    return true;
  }

  /** A large trade and a sustained move in the same direction within a minute. */
  private combine(t: number): Alert[] {
    const trade = this.lastLargeTrade;
    const move = this.lastMove;
    if (!trade || !move || Math.abs(trade.t - move.t) > COMBINE_MS) return [];
    const same = (trade.side === "buy") === (move.direction === "up");
    if (!same || !this.quiet("combined", t)) return [];
    return [{ t, kind: "combined", direction: move.direction, text: `Unusual activity: a large ${trade.side} and a sustained move ${move.direction} within a minute` }];
  }
}
