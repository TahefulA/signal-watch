/**
 * Receipt verification. A quote Gemini returns is only kept if it can be found
 * in the source document; the version shown is always the source's own text.
 */

const QUOTE_LIMIT = 320;

/** Lowercases, unifies quote marks and dashes, and drops whitespace, keeping a map back to the original. */
function loose(text: string): { value: string; index: number[] } {
  const chars: string[] = [];
  const index: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let c = text[i];
    if (/\s/.test(c)) continue;
    if (/[‘’‚′`]/.test(c)) c = "'";
    else if (/[“”„″]/.test(c)) c = '"';
    else if (/[‐-―−]/.test(c)) c = "-";
    chars.push(c.toLowerCase());
    index.push(i);
  }
  return { value: chars.join(""), index };
}

function tidy(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / a.size;
}

/** A sentence ends at a newline, or at . ! ? followed by whitespace (so "$ 75.0" does not end one). */
function endsSentence(source: string, i: number): boolean {
  const c = source[i];
  if (c === "\n") return true;
  return /[.!?]/.test(c ?? "") && (i + 1 >= source.length || /\s/.test(source[i + 1]));
}

/** Extends a match to whole-sentence boundaries when the sentence is short enough to show. */
function expandToSentence(source: string, start: number, end: number): [number, number] {
  let s = start;
  while (s > 0 && !endsSentence(source, s - 1) && start - s < 200) s--;
  let e = end;
  while (e < source.length && !(e > 0 && endsSentence(source, e - 1)) && e - end < 200) e++;
  if (e - s <= QUOTE_LIMIT) return [s, e];
  return [start, end];
}

/** Finds a model-provided quote in the source, tolerating whitespace, typography and ellipses. */
export function locateQuote(quote: string, source: string): { start: number; end: number } | null {
  const parts = quote
    .split(/\.{3}|…/)
    .map((p) => p.trim().replace(/^["'“‘]|["'”’]$/g, ""))
    .filter((p) => p.length >= 12);
  if (parts.length === 0) return null;
  const haystack = loose(source);
  let cursor = 0;
  let first = -1;
  let last = -1;
  for (const part of parts) {
    const needle = loose(part).value;
    const at = haystack.value.indexOf(needle, cursor);
    if (at < 0) return null;
    if (first < 0) first = haystack.index[at];
    last = haystack.index[at + needle.length - 1] + 1;
    cursor = at + needle.length;
  }
  return { start: first, end: last };
}

/**
 * Returns the verbatim source text for a model-provided quote, or null when the
 * quote cannot be found. Handles whitespace and typography differences, quotes
 * elided with an ellipsis, and light paraphrase of a single sentence.
 */
export function verifyQuote(quote: string, source: string, sentences: string[]): string | null {
  const found = locateQuote(quote, source);
  if (found) {
    const [s, e] = expandToSentence(source, found.start, found.end);
    return tidy(source.slice(s, e));
  }

  // Light paraphrase: accept the closest single sentence if nearly all words match.
  const wanted = tokens(quote);
  let best: string | null = null;
  let bestScore = 0;
  for (const sentence of sentences) {
    const score = overlap(wanted, tokens(sentence));
    if (score > bestScore) {
      bestScore = score;
      best = sentence;
    }
  }
  return best && bestScore >= 0.85 && best.length <= QUOTE_LIMIT * 1.5 ? tidy(best) : null;
}
