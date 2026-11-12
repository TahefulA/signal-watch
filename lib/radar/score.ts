import type { NewsDirection, NewsEventType } from "@/types";
import { type Schema, generateJson } from "../gemini";

/**
 * One model call scores every new headline at once: how much it bears on
 * whether lenders are repaid (relevance), which way, what kind of event, and
 * how sure the model is. The model only labels; code applies the cuts,
 * measures the market's reaction and decides what reaches the committee.
 * Anything malformed in the reply is dropped rather than guessed.
 */

export const RELEVANCE_MIN = 0.7;

export const EVENT_TYPES: NewsEventType[] = [
  "default_or_missed_payment",
  "bankruptcy_or_restructuring",
  "refinancing_or_new_debt",
  "liquidity_or_funding",
  "earnings_or_guidance",
  "rating_change",
  "legal_or_regulatory",
  "management_or_owner_change",
  "asset_sale_or_deal",
  "contract_or_customer",
  "other",
];

export interface HeadlineScore {
  relevance: number;
  confidence: number;
  direction: NewsDirection;
  eventType: NewsEventType;
}

const SCHEMA: Schema = {
  type: "OBJECT",
  properties: {
    scores: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "NUMBER" },
          relevance: { type: "NUMBER" },
          direction: { type: "STRING", enum: ["negative", "positive", "neutral"] },
          event_type: { type: "STRING", enum: EVENT_TYPES },
          confidence: { type: "NUMBER" },
        },
        required: ["id", "relevance", "direction", "event_type", "confidence"],
      },
    },
  },
  required: ["scores"],
};

const unit = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1 ? x : null);

export async function scoreHeadlines(company: string, ticker: string, headlines: { headline: string; publisher: string; date: string }[]): Promise<Map<number, HeadlineScore>> {
  const out = new Map<number, HeadlineScore>();
  if (!headlines.length) return out;
  const system = `You label news for a credit fund that lends to ${company} (${ticker}). For each headline:
- relevance, 0 to 1: how much it bears on whether ${company} repays its lenders in full and on time. 0.9 or more: a default, bankruptcy, refinancing, new debt, rating change, large loss, or loss or win of a major customer or funding source. 0.5: ordinary earnings or product news. 0.2 or less: stock-price moves, analyst price targets, listicles, or a story mainly about another company.
- direction: "negative" if it makes repayment harder, "positive" if easier, "neutral" if neither.
- event_type: the closest category.
- confidence, 0 to 1: how sure you are of the direction from the headline alone.
Return one entry per id.`;
  const list = headlines.map((h, i) => `[${i}] ${h.date} ${h.publisher || "Unknown"}: ${h.headline}`).join("\n");
  const raw = (await generateJson(system, list, SCHEMA, { fast: true, thinking: "low", timeoutMs: 30_000 })) as { scores?: Record<string, unknown>[] };
  for (const s of raw.scores ?? []) {
    const id = s.id;
    const relevance = unit(s.relevance);
    const confidence = unit(s.confidence);
    const direction = s.direction === "negative" || s.direction === "positive" || s.direction === "neutral" ? s.direction : null;
    const eventType = EVENT_TYPES.find((t) => t === s.event_type) ?? null;
    if (typeof id !== "number" || !Number.isInteger(id) || id < 0 || id >= headlines.length || out.has(id)) continue;
    if (relevance === null || confidence === null || !direction || !eventType) continue;
    out.set(id, { relevance, confidence, direction, eventType });
  }
  return out;
}
