import type { BookEvent, Level } from "./polymarket";

/**
 * A level-2 book: total size resting at each price on each side. Prediction
 * market books carry huge resting orders at 0.1 cents that never trade, so
 * imbalance is measured near the touch, within `band` of the mid.
 */
export class OrderBook {
  private bids = new Map<number, number>();
  private asks = new Map<number, number>();

  apply(e: BookEvent): void {
    if (e.kind === "book") {
      this.bids = new Map(e.bids.filter((l) => l.size > 0).map((l) => [l.price, l.size]));
      this.asks = new Map(e.asks.filter((l) => l.size > 0).map((l) => [l.price, l.size]));
    } else if (e.kind === "level") {
      const side = e.side === "bid" ? this.bids : this.asks;
      if (e.size > 0) side.set(e.price, e.size);
      else side.delete(e.price);
    }
  }

  bestBid(): number | null {
    let best: number | null = null;
    for (const p of this.bids.keys()) if (best === null || p > best) best = p;
    return best;
  }

  bestAsk(): number | null {
    let best: number | null = null;
    for (const p of this.asks.keys()) if (best === null || p < best) best = p;
    return best;
  }

  mid(): number | null {
    const b = this.bestBid();
    const a = this.bestAsk();
    return b !== null && a !== null ? (a + b) / 2 : null;
  }

  /** (bid depth - ask depth) / (bid depth + ask depth) within `band` of the mid: +1 all bids, -1 all asks. */
  imbalance(band = 0.05): number | null {
    const m = this.mid();
    if (m === null) return null;
    let bid = 0;
    let ask = 0;
    for (const [p, s] of this.bids) if (p >= m - band) bid += s;
    for (const [p, s] of this.asks) if (p <= m + band) ask += s;
    return bid + ask ? (bid - ask) / (bid + ask) : null;
  }

  /** The best `n` levels each side, for the depth ladder. */
  top(n = 8): { bids: Level[]; asks: Level[] } {
    const sorted = (m: Map<number, number>, desc: boolean) =>
      [...m].sort((a, b) => (desc ? b[0] - a[0] : a[0] - b[0])).slice(0, n).map(([price, size]) => ({ price, size }));
    return { bids: sorted(this.bids, true), asks: sorted(this.asks, false) };
  }
}
