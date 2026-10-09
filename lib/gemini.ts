/**
 * Gemini client. Gemini classifies language only: tone, risk phrases and
 * headline polarity. Every number shown in the product is computed from source
 * data, and generated prose is checked by verifyNumbers before use.
 */

const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

export function geminiEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

async function generate(prompt: string, json: boolean): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          ...(json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    },
  );
  if (!response.ok) throw new Error(`Gemini ${response.status}: ${await response.text()}`);
  const body = (await response.json()) as GeminiResponse;
  return body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

export interface FilingToneResult {
  tone: "bullish" | "bearish" | "neutral";
  confidence: number;
  risk_phrases: string[];
}

function isFilingTone(value: unknown): value is FilingToneResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.tone === "bullish" || v.tone === "bearish" || v.tone === "neutral") &&
    typeof v.confidence === "number" &&
    Array.isArray(v.risk_phrases)
  );
}

/** Management tone of an MD&A excerpt, mapped to 0-100 (higher is more bullish). */
export async function classifyFilingTone(excerpt: string): Promise<number | null> {
  const prompt = `You are a credit analyst. Read the following SEC filing excerpt and extract:
1. Management tone: "bullish", "bearish", or "neutral", with a 0-100 confidence.
2. Key risk phrases: any mention of "material weakness", "going concern", "restatement", "covenant", "default", "liquidity", quoted exactly.

Return JSON only, shaped as {"tone": string, "confidence": number, "risk_phrases": string[]}. No commentary.

Filing text:
${excerpt.slice(0, 30_000)}`;
  try {
    const parsed: unknown = JSON.parse(await generate(prompt, true));
    if (!isFilingTone(parsed)) return null;
    const strength = Math.max(0, Math.min(100, parsed.confidence)) / 2;
    if (parsed.tone === "bullish") return Math.round(50 + strength);
    if (parsed.tone === "bearish") return Math.round(50 - strength);
    return 50;
  } catch {
    return null;
  }
}

/** Headline polarity for a batch, aligned to input order. Null if the call fails. */
export async function classifyHeadlines(headlines: string[]): Promise<(-1 | 0 | 1)[] | null> {
  if (headlines.length === 0) return [];
  const numbered = headlines.map((h, i) => `${i}: ${h}`).join("\n");
  const prompt = `Classify each headline's implication for the named company's stock or credit as -1 (negative), 0 (neutral), or 1 (positive).
Return JSON only: an array of integers with exactly ${headlines.length} entries, in order.

${numbered}`;
  try {
    const parsed: unknown = JSON.parse(await generate(prompt, true));
    if (!Array.isArray(parsed) || parsed.length !== headlines.length) return null;
    return parsed.map((v) => (v === 1 ? 1 : v === -1 ? -1 : 0));
  } catch {
    return null;
  }
}

/** Numbers that read as figures: currency, percentages, decimals and grouped thousands. */
export function extractFigures(text: string): string[] {
  return (text.match(/\$\s?\d[\d,]*(\.\d+)?|\d[\d,]*\.\d+%?|\d+%|\d{1,3}(,\d{3})+/g) ?? []).map((n) =>
    n.replace(/[$,\s%]/g, ""),
  );
}

/** True when every figure in the output appears in the supplied facts. */
export function verifyNumbers(output: string, facts: string): boolean {
  const allowed = new Set(extractFigures(facts));
  return extractFigures(output).every((n) => allowed.has(n));
}

/**
 * One-sentence summary of why a ticker is flagged. Retries twice if Gemini
 * introduces a figure that is not in the facts, then falls back to the template.
 */
export async function summarize(facts: string, fallback: string): Promise<string> {
  if (!geminiEnabled()) return fallback;
  const prompt = `Write one plain sentence, under 25 words, telling a credit analyst why this company is worth a look today.
Use only these facts. Do not add numbers that are not in them. No hype, no advice.

Facts:
${facts}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const text = (await generate(prompt, false)).trim().replace(/\s+/g, " ");
      if (text && verifyNumbers(text, facts)) return text;
    } catch {
      break;
    }
  }
  return fallback;
}
