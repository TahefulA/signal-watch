import type { AskAnswer, Report } from "@/types";
import { type Schema, extractFigures, generateJson } from "./gemini";
import { unsupportedRanking } from "./graph";
import { dropUnsupported, toSpans } from "./memo";
import { ASK_SYSTEM as SYSTEM } from "./prompts/ask";

/**
 * Natural-language questions answered only from one report's graph. The model
 * cites entity ids; the quotes shown come from the report, never from the model,
 * and any sentence with a figure outside the report is removed.
 */

const NOT_FOUND = "This information is not in the current graph. Check the full filing or another source.";

const SCHEMA: Schema = {
  type: "OBJECT",
  properties: {
    answer: { type: "STRING" },
    cited_ids: { type: "ARRAY", items: { type: "STRING" } },
    not_found: { type: "STRING", enum: ["true", "false"] },
  },
  required: ["answer", "cited_ids", "not_found"],
};

function graphFacts(report: Report): string {
  const { graph, capital, changes } = report;
  const nodes = graph.nodes
    .filter((n) => n.change?.kind !== "removed")
    .map((n) =>
      [
        `- id: ${n.id}`,
        n.name,
        n.isCentral ? "subject company" : `type: ${n.type}`,
        n.isCentral ? null : `relationship: ${n.relationDetail ?? n.relationType ?? ""} (${n.relationship})`,
        n.isCentral ? null : `severity: ${n.severity}`,
        n.magnitude ? `figure: ${n.magnitude.label}` : null,
        n.strategic?.whyItMatters ? `why it matters: ${n.strategic.whyItMatters}` : null,
        n.strategic?.protection ? `protection: ${n.strategic.protection.text}` : null,
        n.parent ? `parent: ${n.parent.name}` : null,
        `${n.sourceType} ${n.fiscalPeriod ?? ""} ${n.sourceDate}: "${n.sourceQuote}"`,
      ]
        .filter(Boolean)
        .join(" | "),
    )
    .join("\n");
  const central = graph.nodes.find((n) => n.isCentral);
  const edges = graph.edges
    .filter((e) => e.source !== central?.id)
    .map((e) => `- ${e.source} -> ${e.target}: ${e.relationship}`)
    .join("\n");
  const metrics = capital ? capital.metrics.map((m) => `- ${m.label}: ${m.display} (${m.note})`).join("\n") : "- not available";
  const instruments = capital
    ? capital.instruments.map((i) => `- ${i.name}: ${i.outstandingText ?? i.commitmentText ?? "amount not disclosed"}; maturity ${i.maturity ?? "not disclosed"}; coupon ${i.coupon ?? "not found"}; ${i.seniority}`).join("\n")
    : "";
  const changeLines = changes ? changes.changes.filter((c) => !c.judgment).map((c) => `- ${c.name}: ${c.detail}`).join("\n") : "- not compared";
  const ratings = graph.company.ratings?.length ? graph.company.ratings.map((r) => `${r.agency} ${r.rating}`).join(", ") : "none stated in the filings read";
  return `Company: ${graph.company.name} (${graph.company.ticker}). Credit ratings: ${ratings}.

Entities:
${nodes}

Links between entities:
${edges || "- none"}

Capital structure (id "capital"):
${metrics}
${instruments}

Changes since the previous quarter:
${changeLines}`;
}

export async function answerQuestion(report: Report, question: string): Promise<AskAnswer> {
  const facts = graphFacts(report);
  const allowed = new Set([...extractFigures(facts), ...extractFigures(question)]);
  const ids = new Set([...report.graph.nodes.map((n) => n.id), "capital"]);
  const names = new Map<string, string>([...report.graph.nodes.map((n) => [n.id, n.name] as [string, string]), ["capital", "capital structure"]]);

  const raw = await generateJson(SYSTEM, `${facts}\n\nQuestion: ${question}`, SCHEMA, { task: "ask", thinking: "low" });
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as { answer?: unknown; cited_ids?: unknown; not_found?: unknown };
  const text = typeof r.answer === "string" ? r.answer : "";
  if (r.not_found === "true" || !text.trim()) return { question, spans: [{ text: NOT_FOUND }], citedIds: [], notFound: true, removed: 0 };

  const cleaned = dropUnsupported(text, allowed);
  if (cleaned.text.length === 0 || unsupportedRanking(cleaned.text, [facts])) {
    return { question, spans: [{ text: NOT_FOUND }], citedIds: [], notFound: true, removed: cleaned.removed };
  }
  const spans = toSpans(cleaned.text, ids, names);
  const cited = new Set<string>([
    ...(Array.isArray(r.cited_ids) ? r.cited_ids.filter((id): id is string => typeof id === "string" && ids.has(id)) : []),
    ...spans.map((s) => s.entityId).filter((id): id is string => Boolean(id)),
  ]);
  return { question, spans, citedIds: Array.from(cited), notFound: false, removed: cleaned.removed };
}
