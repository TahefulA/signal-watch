/**
 * Gemini client. Gemini reads and classifies language: which entities a filing
 * names, how they relate to the company, and how material they are. Quotes are
 * verified against the source text before they reach the map, and memo figures
 * are checked against the facts Gemini was given.
 */

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
/** Used when the primary model is overloaded. */
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL ?? "gemini-3.5-flash-lite";
const RETRYABLE = new Set([429, 500, 503]);
const TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS ?? 55_000);

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly kind: "config" | "http" | "parse" | "timeout",
    readonly status?: number,
  ) {
    super(message);
  }
}

export function geminiEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** Gemini's OpenAPI-style response schema. */
export interface Schema {
  type: "OBJECT" | "ARRAY" | "STRING" | "NUMBER" | "BOOLEAN";
  nullable?: boolean;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  enum?: string[];
  description?: string;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
}

/**
 * Calls Gemini for structured JSON. Overload responses (429, 503) are retried
 * briefly, then the request moves to the fallback model.
 */
export interface GenerateOptions {
  /** Lower reasoning effort for drafting tasks where latency matters more than depth. */
  thinking?: "low" | "high";
  /** Per-call timeout for long outputs; defaults to GEMINI_TIMEOUT_MS. */
  timeoutMs?: number;
}

export async function generateJson(system: string, prompt: string, schema: Schema, options: GenerateOptions = {}): Promise<unknown> {
  let lastError: GeminiError | null = null;
  const attempts = [MODEL, MODEL, FALLBACK_MODEL, FALLBACK_MODEL];
  for (let i = 0; i < attempts.length; i++) {
    try {
      return await callModel(attempts[i], system, prompt, schema, options);
    } catch (error) {
      if (!(error instanceof GeminiError)) throw error;
      // A timeout goes straight to the faster fallback model rather than waiting again.
      if (error.kind === "timeout" && attempts[i] === MODEL) {
        lastError = error;
        i = attempts.indexOf(FALLBACK_MODEL) - 1;
        continue;
      }
      if (error.status === undefined || !RETRYABLE.has(error.status)) throw error;
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }
  throw lastError ?? new GeminiError("Gemini is unavailable", "http");
}

async function callModel(model: string, system: string, prompt: string, schema: Schema, options: GenerateOptions): Promise<unknown> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("GEMINI_API_KEY is not set", "config");

  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          // Twenty-five entities with their context run past the default output limit, which truncates the JSON.
          maxOutputTokens: 32_768,
          responseMimeType: "application/json",
          responseSchema: schema,
          ...(options.thinking ? { thinkingConfig: { thinkingLevel: options.thinking } } : {}),
        },
      }),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    console.warn(`Gemini ${model}: ${timedOut ? "timed out" : "request failed"} after ${Date.now() - started} ms`);
    throw new GeminiError(timedOut ? "Gemini timed out" : `Gemini request failed: ${String(error)}`, timedOut ? "timeout" : "http");
  }
  if (!response.ok) {
    console.warn(`Gemini ${model}: HTTP ${response.status} after ${Date.now() - started} ms`);
    throw new GeminiError(`Gemini ${response.status}: ${(await response.text()).slice(0, 300)}`, "http", response.status);
  }
  const body = (await response.json()) as GeminiResponse;
  const candidate = body.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  console.info(`Gemini ${model}: ${candidate?.finishReason ?? "no candidate"}, ${text.length} chars in ${Date.now() - started} ms`);
  try {
    return JSON.parse(text);
  } catch {
    throw new GeminiError(`Gemini returned invalid JSON (${candidate?.finishReason ?? "unknown"})`, "parse");
  }
}

/** Numbers that read as figures: currency, percentages, decimals, grouped thousands and multi-digit integers. */
export function extractFigures(text: string): string[] {
  return (text.match(/\$?\s?\d[\d,]*(\.\d+)?%?/g) ?? [])
    .map((n) => n.replace(/[$,\s%]/g, "").replace(/\.0+$/, ""))
    .filter((n) => n.length >= 2 || n.includes("."));
}
