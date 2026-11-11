/**
 * Robust statistics. Trade sizes and price moves are heavy-tailed: one whale
 * trade inflates a standard deviation enough to hide the next one. The median
 * and the median absolute deviation (MAD) barely move, so outliers stay
 * visible.
 */

export function median(values: number[]): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Median absolute deviation from the median. */
export function calculateMAD(values: number[], center = median(values)): number {
  return median(values.map((v) => Math.abs(v - center)));
}

/** MAD times 1.4826 estimates the standard deviation when the data are normal. */
export const MAD_TO_SIGMA = 1.4826;

/**
 * The modified z-score of Iglewicz and Hoaglin: 0.6745 (x - median) / MAD,
 * flagged above 3.5. When more than half the window is one value the MAD is
 * zero; the mean absolute deviation (times 1.2533 to the same scale) stands
 * in, and when that is zero too nothing differs from anything.
 */
export function robustZ(x: number, values: number[]): number {
  const m = median(values);
  const mad = calculateMAD(values, m);
  if (mad > 0) return (0.6745 * (x - m)) / mad;
  const meanAd = values.reduce((s, v) => s + Math.abs(v - m), 0) / (values.length || 1);
  if (meanAd > 0) return (x - m) / (1.2533 * meanAd);
  return x === m ? 0 : Infinity * Math.sign(x - m);
}

export const OUTLIER_Z = 3.5;
