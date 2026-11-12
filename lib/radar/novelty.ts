/**
 * Is this headline a new story or a rewrite of one already seen? Outlets
 * reword the same wire story, so exact matching misses repeats. Each headline
 * becomes a set of content words (lower case, plural "s" stripped, stopwords
 * and the company's own name removed, since every headline about the company
 * shares those). Two headlines overlap by
 *
 *   overlap(A, B) = |A ∩ B| / min(|A|, |B|)
 *
 * which, unlike Jaccard, is not pulled down when one outlet writes a longer
 * headline. Novelty is one minus the largest overlap with any headline seen in
 * the past week. Deterministic, free and testable; an embedding model would
 * catch synonyms ("backstop" vs "guarantee") at the cost of a model call per
 * headline.
 */

const STOP = new Set(
  "a an and are as at be by for from has have in into is it its of on or over says say said than that the their this to up was were will with after amid new its stock stocks shares share inc corp co ltd plc company holdings group".split(" "),
);

/** At or above this, a headline is the same story as one already seen. */
export const NOVELTY_MIN = 0.6;

export function words(headline: string, exclude: Set<string> = new Set()): Set<string> {
  const out = new Set<string>();
  for (const raw of headline.toLowerCase().replace(/[’']s\b/g, "").split(/[^a-z0-9.$%]+/)) {
    const w = raw.replace(/^\.+|\.+$/g, "").replace(/(?<=[a-z]{3})s$/, "");
    if (w.length < 2 || STOP.has(w) || exclude.has(w)) continue;
    out.add(w);
  }
  return out;
}

export function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / Math.min(a.size, b.size);
}

/** The company's name and ticker as words, removed before comparing. */
export function nameWords(name: string, ticker: string): Set<string> {
  return new Set([...words(name), ticker.toLowerCase()]);
}

/** Novelty of a headline against those already seen, and the closest one when it is a repeat. */
export function novelty(headline: string, seen: string[], exclude: Set<string>): { novelty: number; closest: string | null } {
  const mine = words(headline, exclude);
  let best = 0;
  let closest: string | null = null;
  for (const other of seen) {
    const o = overlap(mine, words(other, exclude));
    if (o > best) {
      best = o;
      closest = other;
    }
  }
  return { novelty: 1 - best, closest };
}
