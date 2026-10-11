import type { BriefItem, BriefRisk, BriefSource, Citation, Entity, MeetingBrief, PeerComparison, Report } from "@/types";
import { daysBetween } from "./dates";
import { type Schema, extractFigures, generateJson } from "./gemini";
import { unsupportedRanking } from "./graph";
import { dropUnsupported, entityFacts, marketFacts, toSpans } from "./memo";

/**
 * Meeting preparation: a one-page brief drawn from a saved report. Gemini writes
 * the three things to know and the questions; every figure it uses must be in
 * the facts it was given, and every line carries the quotes of the entities it names.
 * The numbers, risks and comparables are assembled directly, without the model.
 */

const SYSTEM = `You are preparing a credit analyst for a meeting with a company's management.

From the facts provided, write:
- must_know: exactly three sentences, the three most important things to know about this company's credit right now. Each sentence should combine an entity or figure from the facts with why it matters.
- questions: five to seven questions to ask management. Base each on a gap or uncertainty in the facts: a figure that is not disclosed, a change since the previous quarter, a concentration, a covenant or maturity, a regulatory process. For each, basis is one short sentence naming the gap it comes from.

Rules:
- Use only the facts provided. Every number you write must appear in the facts exactly as given.
- Never ask for something the facts already state, including anything in an entity's quote.
- When you mention an entity from the list, write it as {{entity_id|words as they read in the sentence}}. Use only ids from the list.
- Plain, specific language a credit analyst would use. No price predictions, no ratings, no scores.`;

const SCHEMA: Schema = {
  type: "OBJECT",
  properties: {
    must_know: { type: "ARRAY", items: { type: "STRING" } },
    questions: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { question: { type: "STRING" }, basis: { type: "STRING" } }, required: ["question", "basis"] },
    },
  },
  required: ["must_know", "questions"],
};

const SEVERITY_ORDER = ["high", "medium", "low", "none"];
const RISK_TYPES = ["risk", "regulatory", "macro"];

function citationOf(e: Entity): Citation {
  return { quote: e.sourceQuote, sourceType: e.sourceType, sourceDate: e.sourceDate, sourceUrl: e.sourceUrl, sourceLabel: e.sourceLabel, page: e.sourcePage ?? null };
}

export function capitalFacts(report: Report): string {
  const c = report.capital;
  if (!c) return "Capital structure: not available.";
  const metrics = c.metrics.map((m) => `- ${m.label}: ${m.display} (${m.note})`).join("\n");
  const instruments = c.instruments
    .map((i) => [
          `- ${i.name}`,
          i.outstanding !== null ? `outstanding ${i.outstandingText}` : i.commitmentText ? `commitment ${i.commitmentText}` : null,
          i.maturity ? `maturity ${i.maturity}` : null,
          i.coupon ? `coupon ${i.coupon}` : null,
        ]
          .filter(Boolean)
          .join("; "))
    .join("\n");
  return `Capital structure from the ${c.sourceType} filed ${c.sourceDate}:\n${metrics}\nInstruments:\n${instruments}`;
}

export function changeFacts(report: Report): string {
  const ch = report.changes;
  if (!ch) return "Changes since the previous quarter: not compared.";
  const lines = ch.changes.filter((c) => !c.judgment).map((c) => `- ${c.name}: ${c.detail}${c.before || c.after ? ` (${c.before ?? "none"} to ${c.after ?? "none"})` : ""}`);
  return `Changes since the previous quarter's filings:\n${lines.join("\n") || "- none"}`;
}

function peerFacts(comparison: PeerComparison | null): string {
  if (!comparison) return "Peers: not compared.";
  const shared = comparison.shared.map((s) => `- ${s.label}: ${s.members.map((m) => m.ticker).join(" and ")}`).join("\n");
  const rows = comparison.metrics.map((r) => `- ${r.label}: ${r.values.map((v) => `${v.ticker} ${v.display}`).join("; ")}`).join("\n");
  return `Peers compared: ${comparison.companies.map((c) => c.ticker).join(", ")}\nShared:\n${shared || "- none"}\nMetrics:\n${rows}`;
}

/** Gaps the questions should come from, found directly in the report. */
function gapFacts(report: Report): string {
  const gaps: string[] = [];
  const entities = report.graph.nodes.filter((n) => !n.isCentral);
  for (const e of entities) {
    if (e.magnitude === null && (e.relationType === "CUSTOMER_OF" || e.relationType === "SUPPLIES_TO" || e.relationType === "GUARANTEES")) {
      gaps.push(`- id ${e.id}: no figure for ${e.name} was found in the filings read`);
    }
  }
  for (const i of report.capital?.instruments ?? []) {
    if (i.kind === "revolver" && i.outstanding === null) gaps.push(`- ${i.name}: no drawn amount was found in the debt note`);
  }
  const ebitda = report.capital?.metrics.find((m) => m.key === "ebitda");
  if (ebitda?.display.startsWith("-")) gaps.push(`- EBITDA for the last 12 months is negative (${ebitda.display}); leverage and coverage ratios are not meaningful`);
  return `Gaps:\n${gaps.join("\n") || "- none found"}`;
}

function capitalSource(report: Report): BriefSource[] {
  const c = report.capital;
  return c ? [{ label: `Capital structure, ${c.sourceType} filed ${c.sourceDate}`, url: c.sourceUrl }] : [];
}

function toItem(text: string, basis: string | undefined, report: Report, capitalFigures: Set<string>): BriefItem {
  const ids = new Set(report.graph.nodes.map((n) => n.id));
  const names = new Map(report.graph.nodes.map((n) => [n.id, n.name]));
  const spans = toSpans(text, ids, names);
  const cited = Array.from(new Set(spans.map((s) => s.entityId).filter((id): id is string => Boolean(id))));
  const citations = cited
    .map((id) => report.graph.nodes.find((n) => n.id === id))
    .filter((n): n is Entity => n !== undefined && !n.isCentral)
    .map(citationOf);
  const usesCapital = extractFigures(text.replace(/\{\{[^|}]+\|?/g, "")).some((f) => capitalFigures.has(f));
  return { spans, basis, citations, sources: usesCapital ? capitalSource(report) : [] };
}

function risksToWatch(report: Report): BriefRisk[] {
  return report.graph.nodes
    .filter((n) => !n.isCentral && n.change?.kind !== "removed" && n.severity !== "none")
    // Risk factors, regulators and macro exposures first; counterparties fill any remaining places.
    .sort(
      (a, b) =>
        Number(!RISK_TYPES.includes(a.type)) - Number(!RISK_TYPES.includes(b.type)) ||
        SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
    )
    .slice(0, 5)
    .map((n) => ({ entityId: n.id, name: n.name, severity: n.severity, citation: citationOf(n) }));
}

function numbers(report: Report, today: string): MeetingBrief["numbers"] {
  const keys = ["total_debt", "net_debt", "ebitda", "debt_to_ebitda", "interest_coverage", "liquidity", "secured_share"];
  const rows: MeetingBrief["numbers"] = (report.capital?.metrics ?? [])
    .filter((m) => keys.includes(m.key))
    .map((m) => ({ label: m.label, display: m.display, note: m.note }));
  const revenue = report.graph.nodes.find((n) => n.magnitude?.kind === "revenue" && /%/.test(n.magnitude.label));
  rows.push({
    label: "Revenue concentration",
    display: revenue?.magnitude ? `${revenue.name}: ${revenue.magnitude.label}` : "Not disclosed",
    note: revenue ? undefined : "No box states a share of revenue.",
  });
  const filed = report.sources.filter((s) => s.sourceType !== "News").map((s) => s.date).sort().at(-1);
  if (filed) rows.push({ label: "Days since last filing", display: String(daysBetween(filed, today)), note: `Latest filing read: ${filed}` });
  return rows;
}

function fallbackItems(report: Report): BriefItem[] {
  return risksToWatch(report)
    .slice(0, 3)
    .map((r) => {
      const e = report.graph.nodes.find((n) => n.id === r.entityId);
      return { spans: [{ text: r.name, entityId: r.entityId }, { text: `: ${e?.relationship ?? ""}.` }], citations: [r.citation], sources: [] };
    });
}

export async function generateBrief(report: Report, comparison: PeerComparison | null, today: string): Promise<MeetingBrief> {
  const facts = [
    `Company: ${report.graph.company.name} (${report.graph.company.ticker})`,
    `Entities:\n${entityFacts(report.graph.nodes)}`,
    capitalFacts(report),
    changeFacts(report),
    peerFacts(comparison),
    marketFacts(report.market, report.graph.company.ticker),
    gapFacts(report),
  ].join("\n\n");
  const allowed = new Set([...extractFigures(facts), ...report.graph.nodes.flatMap((n) => extractFigures(n.sourceDate))]);
  const capitalFigures = new Set(extractFigures(capitalFacts(report)));

  let mustKnow: BriefItem[] = [];
  let questions: BriefItem[] = [];
  for (let attempt = 0; attempt < 2 && (mustKnow.length < 3 || questions.length < 5); attempt++) {
    let raw: unknown;
    try {
      const reminder = attempt > 0 ? "\n\nYour previous answer used numbers that are not in the facts, or too few items. Use only numbers in the facts." : "";
      raw = await generateJson(SYSTEM + reminder, facts, SCHEMA, { thinking: "low" });
    } catch {
      break;
    }
    const r = (typeof raw === "object" && raw !== null ? raw : {}) as { must_know?: unknown; questions?: unknown };
    const known = (Array.isArray(r.must_know) ? r.must_know : [])
      .filter((t): t is string => typeof t === "string")
      .map((t) => dropUnsupported(t, allowed))
      .filter((d) => d.removed === 0 && d.text.length > 0 && !unsupportedRanking(d.text, [facts]))
      .slice(0, 3)
      .map((d) => toItem(d.text, undefined, report, capitalFigures));
    const asked = (Array.isArray(r.questions) ? r.questions : [])
      .filter((q): q is { question: string; basis: string } => typeof q === "object" && q !== null && typeof (q as { question?: unknown }).question === "string")
      .map((q) => ({ q: dropUnsupported(q.question, allowed), basis: typeof q.basis === "string" ? dropUnsupported(q.basis, allowed) : null }))
      .filter((x) => x.q.removed === 0 && x.q.text.length > 0)
      .slice(0, 7)
      .map((x) => toItem(x.q.text, x.basis && x.basis.removed === 0 ? x.basis.text.replace(/\{\{[^|}]+\|([^}]+)\}\}/g, "$1") : undefined, report, capitalFigures));
    if (known.length > mustKnow.length) mustKnow = known;
    if (asked.length > questions.length) questions = asked;
  }
  if (mustKnow.length === 0) mustKnow = fallbackItems(report);

  const comparables = comparison
    ? {
        tickers: comparison.companies.map((c) => c.ticker),
        rows: comparison.metrics.filter((r) =>
          ["Total debt", "Net debt", "EBITDA, last 12 months", "Total debt / EBITDA", "EBITDA / interest", "Cash + revolver availability", "Revenue concentration"].includes(r.label),
        ),
      }
    : null;

  return {
    reportId: report.id,
    generatedAt: new Date().toISOString(),
    mustKnow,
    numbers: numbers(report, today),
    questions,
    risks: risksToWatch(report),
    comparables,
  };
}
