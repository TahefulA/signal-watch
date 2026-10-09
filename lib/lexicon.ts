/**
 * Word lists for deterministic tone scoring. Used directly when Gemini is not
 * configured, and as a cross-check when it is.
 */

export interface RiskPhrase {
  key: string;
  label: string;
  pattern: RegExp;
  points: number;
}

/** Phrases that score when they appear for the first time relative to the baseline filings. */
export const FIRST_TIME_PHRASES: RiskPhrase[] = [
  { key: "material_weakness", label: "material weakness", pattern: /\bmaterial weakness(es)?\b/i, points: 30 },
  { key: "going_concern", label: "going concern", pattern: /\bgoing concern\b|\bsubstantial doubt\b/i, points: 30 },
  {
    key: "restatement",
    label: "restatement",
    pattern:
      /\brestatement of (our|the company\u2019s|the company's|its|the|previously issued) (\w+ )?(consolidated )?financial statements\b|\brestate (our|its|the) (previously issued )?(\w+ )?(consolidated )?financial statements\b|\bnon-reliance on previously issued\b/i,
    points: 25,
  },
];

export const COVENANT_PHRASE: RiskPhrase = {
  key: "covenant",
  label: "new covenant",
  pattern: /\bcovenants?\b/i,
  points: 15,
};

/**
 * Sentences that only describe a hypothetical or confirm an absence, such as
 * "could result in a material weakness" or "no material weaknesses were identified".
 */
/** Disclosure boilerplate that carries no signal on its own. */
export const BOILERPLATE_SENTENCE =
  /no material changes|should be read in conjunction|see (also )?(part|item)|incorporated (herein )?by reference|forward-looking statements/i;

export const HEDGED_SENTENCE =
  /\b(could|may|might|would|if|whether|no|not|none|any|cannot assure|risk that|failure to)\b[^.]{0,80}\b(material weakness|going concern|substantial doubt|restate)/i;

export const LIQUIDITY_PHRASE: RiskPhrase = {
  key: "liquidity_language",
  label: "liquidity language",
  pattern: /\bcash burn\b|\bcash runway\b|\bliquidity runway\b|\binsufficient liquidity\b|\bliquidity constraints?\b|\bmonths of liquidity\b/i,
  points: 10,
};

const POSITIVE_WORDS = [
  "achieve", "achieved", "benefit", "benefited", "exceed", "exceeded", "favorable", "gain", "gains",
  "growth", "improve", "improved", "improvement", "increase", "increased", "momentum", "opportunity",
  "opportunities", "outperform", "profitable", "progress", "record", "strong", "stronger", "strength",
  "success", "successful", "expand", "expanded", "expansion", "robust",
];

const NEGATIVE_WORDS = [
  "adverse", "adversely", "decline", "declined", "decrease", "decreased", "deficit", "delay", "delayed",
  "deteriorate", "deterioration", "difficult", "disruption", "downturn", "impairment", "impaired",
  "loss", "losses", "litigation", "shortfall", "weak", "weaker", "weakness", "unfavorable", "uncertain",
  "uncertainty", "default", "volatility", "headwinds", "challenging", "restructuring", "terminated",
];

const POSITIVE_HEADLINE = [
  "beat", "beats", "surge", "surges", "jump", "jumps", "soar", "soars", "rally", "rallies", "upgrade",
  "upgraded", "upgrades", "raise", "raises", "raised", "record", "gain", "gains", "rise", "rises",
  "climb", "climbs", "strong", "outperform", "outperforms", "wins", "win", "deal", "partnership",
  "higher", "boost", "boosts", "bullish", "buy", "tops", "expands", "approval", "approved",
];

const NEGATIVE_HEADLINE = [
  "fall", "falls", "fell", "drop", "drops", "plunge", "plunges", "slide", "slides", "sink", "sinks",
  "downgrade", "downgraded", "downgrades", "cut", "cuts", "miss", "misses", "lawsuit", "probe",
  "recall", "recalls", "loss", "weak", "tumble", "tumbles", "lower", "slump", "slumps", "concern",
  "concerns", "warns", "warning", "layoffs", "dip", "dips", "decline", "declines", "bearish", "sell",
  "investigation", "halt", "halts", "dilution", "offering", "default", "bankruptcy", "underperform",
];

function countWords(text: string, words: readonly string[]): number {
  const set = new Set(words);
  let count = 0;
  for (const token of text.toLowerCase().match(/[a-z]+/g) ?? []) {
    if (set.has(token)) count++;
  }
  return count;
}

/** Management tone on a 0-100 scale, 50 neutral, higher is more bullish. */
export function documentTone(text: string): number {
  const pos = countWords(text, POSITIVE_WORDS);
  const neg = countWords(text, NEGATIVE_WORDS);
  if (pos + neg === 0) return 50;
  return Math.round(50 + (50 * (pos - neg)) / (pos + neg));
}

/** Headline polarity: -1 bearish, 0 neutral, 1 bullish. */
export function headlinePolarity(headline: string): -1 | 0 | 1 {
  const pos = countWords(headline, POSITIVE_HEADLINE);
  const neg = countWords(headline, NEGATIVE_HEADLINE);
  if (pos > neg) return 1;
  if (neg > pos) return -1;
  return 0;
}
