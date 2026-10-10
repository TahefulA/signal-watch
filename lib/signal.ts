import type { CapitalStructure, EntityGraph, MemoSpan } from "@/types";
import { type Schema, extractFigures, generateJson } from "./gemini";
import { unsupportedRanking } from "./graph";
import { dropUnsupported, entityFacts, toSpans } from "./memo";

/**
 * The Signal Summary above the map: the single most important credit story in
 * three or four sentences. Same rules as the memo: only facts from the report,
 * every figure must be in them, and no ranking words the quotes do not use.
 */

const SYSTEM = `You write the one-paragraph signal summary that sits above a credit analyst's entity map.

Write three or four sentences, at most 60 words in total, capturing the single most important credit story for this company right now. Focus on the highest-severity entities and the capital structure. Be specific: name entities and use figures from the facts. End with what the analyst should watch.

Rules:
- Use only the facts provided. Every number must appear in the facts exactly as given.
- When you mention an entity from the list, write it as {{entity_id|words as they read in the sentence}}.
- No generic phrases such as "the company faces risks". No price predictions, ratings or scores.
- Do not call anything the largest, sole, only, main or primary unless an entity's quote says so.`;

const SCHEMA: Schema = { type: "OBJECT", properties: { signal_summary: { type: "STRING" } }, required: ["signal_summary"] };

function capitalFacts(capital: CapitalStructure | null | undefined): string {
  if (!capital) return "Capital structure: not available.";
  return `Capital structure (${capital.sourceType} filed ${capital.sourceDate}):\n${capital.metrics.map((m) => `- ${m.label}: ${m.display} (${m.note})`).join("\n")}`;
}

export async function generateSignal(graph: EntityGraph, capital: CapitalStructure | null | undefined): Promise<MemoSpan[] | null> {
  const facts = `Company: ${graph.company.name} (${graph.company.ticker})\n\nEntities:\n${entityFacts(graph.nodes)}\n\n${capitalFacts(capital)}`;
  const allowed = new Set([...extractFigures(facts), ...graph.nodes.flatMap((n) => extractFigures(n.sourceDate))]);
  const ids = new Set(graph.nodes.map((n) => n.id));
  const names = new Map(graph.nodes.map((n) => [n.id, n.name]));
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: unknown;
    try {
      raw = await generateJson(SYSTEM + (attempt > 0 ? "\n\nYour previous summary used a number or ranking not in the facts." : ""), facts, SCHEMA, { thinking: "low" });
    } catch {
      return null;
    }
    const text = typeof raw === "object" && raw !== null ? (raw as { signal_summary?: unknown }).signal_summary : null;
    if (typeof text !== "string") continue;
    const cleaned = dropUnsupported(text, allowed);
    if (cleaned.removed > 0 || cleaned.text.length === 0 || unsupportedRanking(cleaned.text, [facts])) continue;
    return toSpans(cleaned.text, ids, names);
  }
  return null;
}

