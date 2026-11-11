/**
 * Median of the last N values: O(log N) per update, O(1) to read.
 *
 * Two heaps split the window: a max-heap holds the lower half and a min-heap
 * the upper half, sized so the lower has the same count or one more. The
 * median is the lower top, or the mean of both tops.
 *
 * A heap cannot remove an arbitrary element in O(log N), so removal is lazy:
 * the value leaving the window is counted in `delayed`, the heap it sits in
 * is charged for it at once (so the halves stay balanced by their live
 * sizes), and it is physically popped only when it reaches a heap's top.
 * Each value is pushed and popped once, so the amortised cost stays O(log N).
 */

class Heap {
  private readonly items: number[] = [];
  constructor(private readonly before: (a: number, b: number) => boolean) {}

  get size(): number {
    return this.items.length;
  }

  top(): number {
    return this.items[0];
  }

  push(v: number): void {
    const a = this.items;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.before(a[i], a[p])) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }

  pop(): number {
    const a = this.items;
    const top = a[0];
    const last = a.pop() as number;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.before(a[l], a[m])) m = l;
        if (r < a.length && this.before(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

export class RollingMedian {
  private readonly low = new Heap((a, b) => a > b);
  private readonly high = new Heap((a, b) => a < b);
  private readonly delayed = new Map<number, number>();
  /** Live counts: heap sizes minus the values waiting to be popped. */
  private lowSize = 0;
  private highSize = 0;
  private readonly window: number[];
  private head = 0;
  private count = 0;

  constructor(readonly size: number) {
    if (!Number.isInteger(size) || size < 1) throw new Error("Window size must be a positive integer");
    this.window = new Array<number>(size);
  }

  push(value: number): void {
    if (Number.isNaN(value)) throw new Error("NaN has no place in a median");
    if (this.count === this.size) this.remove(this.window[this.head]);
    else this.count++;
    this.window[this.head] = value;
    this.head = (this.head + 1) % this.size;
    this.insert(value);
  }

  get length(): number {
    return this.count;
  }

  median(): number {
    if (!this.count) return NaN;
    return this.lowSize > this.highSize ? this.low.top() : (this.low.top() + this.high.top()) / 2;
  }

  private insert(v: number): void {
    if (!this.lowSize || v <= this.low.top()) {
      this.low.push(v);
      this.lowSize++;
    } else {
      this.high.push(v);
      this.highSize++;
    }
    this.rebalance();
  }

  private remove(v: number): void {
    this.delayed.set(v, (this.delayed.get(v) ?? 0) + 1);
    // A value equal to the lower top is in the lower heap: insert sent ties there.
    if (v <= this.low.top()) {
      this.lowSize--;
      if (v === this.low.top()) this.prune(this.low);
    } else {
      this.highSize--;
      if (v === this.high.top()) this.prune(this.high);
    }
    this.rebalance();
  }

  private rebalance(): void {
    if (this.lowSize > this.highSize + 1) {
      this.high.push(this.low.pop());
      this.lowSize--;
      this.highSize++;
      this.prune(this.low);
    } else if (this.lowSize < this.highSize) {
      this.low.push(this.high.pop());
      this.highSize--;
      this.lowSize++;
      this.prune(this.high);
    }
  }

  /** Pops values that already left the window while they sit on top. */
  private prune(heap: Heap): void {
    while (heap.size) {
      const v = heap.top();
      const n = this.delayed.get(v);
      if (!n) break;
      if (n === 1) this.delayed.delete(v);
      else this.delayed.set(v, n - 1);
      heap.pop();
    }
  }
}
