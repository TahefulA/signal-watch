/**
 * Mean and variance of the last N values in O(1) per update: a ring buffer
 * holds the window, and a running sum and sum of squares are adjusted by the
 * value entering and the value leaving. Floating-point error builds up in the
 * running sums over millions of updates, so they are recomputed from the
 * buffer every RESUM updates, which keeps the amortised cost O(1).
 */

const RESUM = 10_000;

export class RollingWindow {
  private readonly buf: Float64Array;
  private head = 0;
  private count = 0;
  private sum = 0;
  private sumSq = 0;
  private sinceResum = 0;

  constructor(readonly size: number) {
    if (!Number.isInteger(size) || size < 1) throw new Error("Window size must be a positive integer");
    this.buf = new Float64Array(size);
  }

  /** Adds a value; returns the one that fell out of the window, if any. */
  push(value: number): number | undefined {
    let evicted: number | undefined;
    if (this.count === this.size) {
      evicted = this.buf[this.head];
      this.sum -= evicted;
      this.sumSq -= evicted * evicted;
    } else {
      this.count++;
    }
    this.buf[this.head] = value;
    this.head = (this.head + 1) % this.size;
    this.sum += value;
    this.sumSq += value * value;
    if (++this.sinceResum >= RESUM) this.resum();
    return evicted;
  }

  get length(): number {
    return this.count;
  }

  get full(): boolean {
    return this.count === this.size;
  }

  mean(): number {
    return this.count ? this.sum / this.count : NaN;
  }

  /** Sample variance (n - 1). */
  variance(): number {
    if (this.count < 2) return NaN;
    return Math.max(0, (this.sumSq - (this.sum * this.sum) / this.count) / (this.count - 1));
  }

  std(): number {
    return Math.sqrt(this.variance());
  }

  /** The window, oldest first. O(N); for the statistics that cannot be kept incrementally. */
  values(): number[] {
    const out: number[] = [];
    const start = this.count === this.size ? this.head : 0;
    for (let i = 0; i < this.count; i++) out.push(this.buf[(start + i) % this.size]);
    return out;
  }

  private resum(): void {
    this.sinceResum = 0;
    let s = 0;
    let q = 0;
    for (const v of this.values()) {
      s += v;
      q += v * v;
    }
    this.sum = s;
    this.sumSq = q;
  }
}
