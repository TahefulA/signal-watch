import type { CounterCitation, DevilsAdvocate, Entity, PatternResult, Report } from "@/types";
import { MEMO_STANCES } from "@/types/devils-advocate";
import { capitalFacts, changeFacts } from "./brief";
import { type PatternContext, runPatterns } from "./devils-advocate-patterns";
import { extractSections } from "./edgar";
import { type Schema, extractFigures, generateJson } from "./gemini";
import { dropUnsupported, entityFacts, toSpans } from "./memo";

/**
 * The Devil's Advocate: Gemini argues against the memo using the memo, the map,
 * the patterns that fired and the filing text. Every figure in the argument must
 * appear in those facts, and each citation points at an entity box, a pattern or
 * the capital structure, so its source label and link are built here rather than
 * written by the model.
 */

const SYSTEM = `You are a skeptical portfolio manager at a credit fund. Your job is to argue AGAINST the investment thesis in the memo below.

Identify the five strongest points in the memo that could be wrong. For each, use the entity, pattern or filing passage that contradicts or undermines it.

Rules:
1. Use ONLY facts from the memo, entities, patterns and filing text provided. Every number you write must appear in them exactly as given.
2. Do not use "likely", "probably" or "may". State what the filings show.
3. Focus on what the memo glosses over: undisclosed terms, deteriorating trends, concentration, structural weaknesses, covenants that could be triggered, maturities.
4. argument: one paragraph of about 200 words. When you mention an entity from the list, write it as {{entity_id|words as they read in the sentence}}. Use only ids from the list.
5. citations: one per claim, three to six of them. ref is an entity id from the list, "pattern:<pattern id>" for a pattern, or "capital" for the capital structure. claim is a few words.
6. patterns_used: the names of the fired patterns your argument relies on, exactly as written.
7. what_to_watch: one specific sentence naming what to check in the next filing.
9. memo_stance: the stance the MEMO ITSELF takes on this credit, not your own: STABLE, CAUTION, AT_RISK or DISTRESSED.
8. No price predictions, no ratings, no scores.`;

const SCHEMA: Schema = {
  type: "OBJECT",
  properties: {
    argument: { type: "STRING" },
    citations: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { claim: { type: "STRING" }, ref: { type: "STRING" } }, required: ["claim", "ref"] },
    },
    patterns_used: { type: "ARRAY", items: { type: "STRING" } },
    what_to_watch: { type: "STRING" },
    memo_stance: { type: "STRING", enum: MEMO_STANCES },
  },
  required: ["argument", "citations", "patterns_used", "what_to_watch", "memo_stance"],
};

const HEDGES = /\b(likely|probably|may)\b/i;
const FILING_BUDGET = 24_000;

function memoText(report: Report): string {
  return report.memo.sections
    .map((s) => `${s.title}: ${s.spans.map((x) => (x.entityId ? `{{${x.entityId}|${x.text}}}` : x.text)).join("")}`)
    .join("\n");
}

function patternFacts(patterns: PatternResult[]): string {
  const fired = patterns.filter((p) => p.status === "fired");
  if (fired.length === 0) return "Patterns that fired: none.";
  return `Patterns that fired:\n${fired
    .map(
      (p) =>
        `- id ${p.id} | ${p.name}: ${p.detail}${p.evidence[0]?.quote ? ` Source ${p.evidence[0].label}: "${p.evidence[0].quote}"` : ""}`,
    )
    .join("\n")}`;
}

/** Risk factors and MD&A of the latest periodic filing, within a budget. */
function filingExcerpt(ctx: PatternContext): string {
  const current = ctx.filings[0];
  if (!current) return "Filing text: not available.";
  const sections = extractSections(`\n${current.text}`).filter((s) => /Risk Factors|Discussion and Analysis/.test(s.label));
  const body = sections.length ? sections.map((s) => `${s.label}\n${s.text}`).join("\n\n") : current.text;
  return `Filing text, ${current.label}:\n${body.slice(0, FILING_BUDGET)}`;
}

function sourceOf(e: Entity): string {
  return [e.sourceType, e.fiscalPeriod ?? e.sourceDate, e.sourcePage ? `p.${e.sourcePage}` : null].filter(Boolean).join(", ");
}

function resolveCitation(ref: string, claim: string, report: Report, patterns: PatternResult[]): CounterCitation | null {
  const r = ref.trim();
  if (r.startsWith("pattern:")) {
    const p = patterns.find((x) => x.id === r.slice(8) && x.status === "fired");
    const ev = p?.evidence[0];
    return p
      ? { claim, source: ev?.label ?? p.name, url: ev?.url ?? null, quote: ev?.quote ?? null, entityId: null, patternId: p.id }
      : null;
  }
  if (r === "capital") {
    const c = report.capital;
    return c
      ? {
          claim,
          source: `${c.sourceType} ${c.fiscalPeriod ?? c.sourceDate}, capital structure`,
          url: c.sourceUrl,
          quote: null,
          entityId: null,
          patternId: null,
        }
      : null;
  }
  const e = report.graph.nodes.find((n) => n.id === r && !n.isCentral);
  return e ? { claim, source: sourceOf(e), url: e.sourceUrl, quote: e.sourceQuote, entityId: e.id, patternId: null } : null;
}

export async function generateDevilsAdvocate(report: Report, ctx: PatternContext): Promise<DevilsAdvocate> {
  const patterns = runPatterns(ctx);
  const facts = [
    `Company: ${report.graph.company.name} (${report.graph.company.ticker})`,
    `Memo:\n${memoText(report)}`,
    `Entities:\n${entityFacts(report.graph.nodes)}`,
    capitalFacts(report),
    changeFacts(report),
    patternFacts(patterns),
    filingExcerpt(ctx),
  ].join("\n\n");
  const allowed = new Set([...extractFigures(facts), ...report.graph.nodes.flatMap((n) => extractFigures(n.sourceDate))]);
  const ids = new Set(report.graph.nodes.map((n) => n.id));
  const names = new Map(report.graph.nodes.map((n) => [n.id, n.name]));

  let best: DevilsAdvocate | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const reminder =
      attempt > 0
        ? "\n\nYour previous answer used a number not in the facts or hedged with likely, probably or may. Use only numbers in the facts and state what the filings show."
        : "";
    let raw: unknown;
    try {
      raw = await generateJson(SYSTEM + reminder, facts, SCHEMA, { thinking: "low" });
    } catch (error) {
      if (best) break;
      throw error;
    }
    const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    const cleaned = dropUnsupported(typeof r.argument === "string" ? r.argument : "", allowed);
    const watch = dropUnsupported(typeof r.what_to_watch === "string" ? r.what_to_watch : "", allowed);
    const citations = (Array.isArray(r.citations) ? r.citations : [])
      .filter(
        (c): c is { claim: string; ref: string } => typeof c === "object" && c !== null && typeof (c as { ref?: unknown }).ref === "string",
      )
      .map((c) => resolveCitation(c.ref, String(c.claim ?? ""), report, patterns))
      .filter((c): c is CounterCitation => c !== null);
    // Patterns count as used when the model names one or cites it.
    const named = (Array.isArray(r.patterns_used) ? r.patterns_used : [])
      .filter((n): n is string => typeof n === "string")
      .map((n) => n.toLowerCase().trim());
    const cited = new Set(citations.map((c) => c.patternId));
    const used = patterns
      .filter((p) => p.status === "fired" && (named.includes(p.name.toLowerCase()) || cited.has(p.id)))
      .map((p) => p.name);
    const candidate: DevilsAdvocate = {
      reportId: report.id,
      generatedAt: new Date().toISOString(),
      argument: toSpans(cleaned.text, ids, names),
      citations,
      patternsUsed: used,
      whatToWatch: watch.removed === 0 ? watch.text.replace(/\{\{[^|}]+\|([^}]+)\}\}/g, "$1") : "",
      memoStance: MEMO_STANCES.find((x) => x === r.memo_stance) ?? null,
      patterns,
      removed: cleaned.removed + watch.removed,
    };
    if (cleaned.text.length === 0) continue;
    if (!best || candidate.removed < best.removed) best = candidate;
    if (candidate.removed === 0 && !HEDGES.test(cleaned.text)) break;
  }
  if (!best) throw new Error("Gemini did not return a counter-argument.");
  return best;
}
