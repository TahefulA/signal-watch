/**
 * Page's two-sided CUSUM. Each input is a standardised step (how far this
 * move is from normal, in units of normal spread). The upper sum gathers
 * steps above the drift allowance k, the lower sum steps below -k; either
 * passing the threshold h means the series has shifted, not just wobbled.
 * With k = 0.5 and h = 5 a one-sigma shift is caught in about ten steps and
 * pure noise raises a false alarm about once in 465 steps.
 */

export type CusumSignal = "up" | "down" | null;

export class CUSUMDetector {
  private pos = 0;
  private neg = 0;

  constructor(
    readonly threshold = 5,
    readonly drift = 0.5,
  ) {}

  /** Feeds one standardised step; returns the direction when a shift is detected, then starts over. */
  update(z: number): CusumSignal {
    if (!Number.isFinite(z)) return null;
    this.pos = Math.max(0, this.pos + z - this.drift);
    this.neg = Math.max(0, this.neg - z - this.drift);
    if (this.pos > this.threshold) {
      this.reset();
      return "up";
    }
    if (this.neg > this.threshold) {
      this.reset();
      return "down";
    }
    return null;
  }

  get state(): { pos: number; neg: number; threshold: number } {
    return { pos: this.pos, neg: this.neg, threshold: this.threshold };
  }

  reset(): void {
    this.pos = 0;
    this.neg = 0;
  }
}
