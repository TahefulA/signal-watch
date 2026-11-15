/**
 * Gemini list prices, US dollars per million tokens, paid Standard tier.
 * Output includes thinking tokens. Source: ai.google.dev/gemini-api/docs/pricing,
 * read 2026-11-15. A model missing here is logged with a null cost rather
 * than a guessed one.
 */
export const PRICES: Record<string, { input: number; output: number }> = {
  "gemini-3.5-flash": { input: 1.5, output: 9.0 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
};

export function costUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const p = PRICES[model];
  return p ? (inputTokens * p.input + outputTokens * p.output) / 1e6 : null;
}
