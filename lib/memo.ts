import type { Entity, EntityGraph, MarketSnapshot, Memo, MemoSection, MemoSectionKey, MemoSpan } from "@/types";
import { type Schema, extractFigures, generateJson } from "./gemini";

const SECTIONS: { key: MemoSectionKey; title: string }[] = [
  { key: "executive_summary", title: "Executive summary" },
  { key: "thesis", title: "Thesis" },
  { key: "key_risks", title: "Key risks" },
  { key: "mitigants", title: "Mitigants" },
  { key: "relative_value", title: "Relative value" },
];

const SYSTEM = `You are a credit analyst writing a short memo for an investment committee.

Write five sections, one paragraph each, under 300 words in total:
- executive_summary: 2-3 sentences stating the overall credit situation.
- thesis: 3-4 sentences on why this company matters today.
- key_risks: 3-4 sentences naming the top 3-4 risks from the entity list.
- mitigants: 3-4 sentences naming what offsets those risks.
- relative_value: 2-3 sentences using only the market facts provided (performance against the S&P 500, position in the 52-week range, market capitalization).

Rules:
- Use only the facts provided. Do not state spreads, ratings, leverage, coverage ratios, multiples or peer comparisons unless they appear in the facts. If the facts do not support a point, say what would need to be checked instead.
- Every number you write must appear in the facts exactly as given.
- When you mention an entity from the list, write it as {{entity_id|words as they read in the sentence}}, for example {{fluidstack|Fluidstack}}. Use only ids from the list.
- Write like a credit analyst: plain, specific, complete sentences. Use terms such as customer concentration, cycle phase, liquidity, refinancing risk, and fulcrum security where they fit. No marketing language, no bullet points, no price predictions.`;

const SCHEMA: Schema = {
  type: "OBJECT",
  properties: Object.fromEntries(SECTIONS.map((s) => [s.key, { type: "STRING" } satisfies Schema])),
  required: SECTIONS.map((s) => s.key),
};

function money(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)} billion`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)} million`;
  return `$${value.toFixed(2)}`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function marketFacts(market: MarketSnapshot | null, ticker: string): string {
  if (!market) return "Market data: not available.";
  const lines = [
    `Last close (${market.priceDate}): ${money(market.price)}`,
    `90-day price change: ${percent(market.return90d)}`,
    `52-week closing range: ${money(market.low52w)} to ${money(market.high52w)}`,
  ];
  if (market.benchmarkReturn90d !== null) lines.push(`S&P 500 (SPY) 90-day change: ${percent(market.benchmarkReturn90d)}`);
  if (market.marketCap !== null) lines.push(`Market capitalization: ${money(market.marketCap)}`);
  return `Market data for ${ticker}:\n${lines.join("\n")}`;
}

export function entityFacts(nodes: Entity[]): string {
  return nodes
    .filter((n) => !n.isCentral && n.change?.kind !== "removed")
    .map(
      (n) =>
        `- id: ${n.id} | ${n.name} | type: ${n.type} | ${n.relationDetail ?? n.relationship} | severity: ${n.severity}` +
        `${n.magnitude ? ` | figure: ${n.magnitude.label}` : ""} | ${n.sourceType} ${n.sourceDate}: "${n.sourceQuote}"`,
    )
    .join("\n");
}

/** Splits {{id|text}} markers into linked spans, keeping only ids on the map. */
export function toSpans(text: string, ids: Set<string>, names: Map<string, string>): MemoSpan[] {
  // Gemini sometimes writes a bare id such as kentucky-power-company; turn it into a link with the entity's name.
  // A lowercase single word counts only when it is exactly an entity's name written in lowercase ("anthropic").
  const marked = text.replace(/\{\{[^}]*\}\}|\b[a-z0-9]+(?:-[a-z0-9]+)*\b/g, (token) => {
    if (token.startsWith("{{") || !ids.has(token)) return token;
    if (!token.includes("-") && (names.get(token) ?? "").toLowerCase() !== token) return token;
    return `{{${token}|${names.get(token) ?? token}}}`;
  });
  return marked
    .split(/(\{\{[^}]+\}\})/)
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^\{\{\s*([^|}]+?)\s*(?:\|\s*([^}]+?)\s*)?\}\}$/);
      if (!match) return { text: part };
      // Accept "new-york governor kathy hochul" for new-york-governor-kathy-hochul.
      const loose = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const byId = (t: string) => (ids.has(t) ? t : Array.from(ids).find((x) => x === loose(t)));
      // Gemini sometimes copies the placeholder: {{entity_id|governor-kathy-hochul}}. Then the label is the id.
      const id = byId(match[1]) ?? (match[2] ? byId(match[2]) : undefined) ?? match[1];
      const written = match[2];
      // A label that is just the id, in any form, reads badly; show the entity's name instead.
      const label = written && loose(written) !== loose(id) ? written : (names.get(id) ?? written ?? id);
      return ids.has(id) ? { text: label, entityId: id } : { text: label };
    });
}

/** Removes sentences containing a figure that is not in the facts. Returns the cleaned text and how many were removed. */
export function dropUnsupported(text: string, allowed: Set<string>): { text: string; removed: number } {
  // Split only at sentence ends, so decimals such as 34.1% stay intact.
  // A single capital before the period is an initial ("Michael C. Bucella"), not a sentence end.
  const sentences = text.split(/(?<=[.!?])(?<!\b[A-Z]\.)\s+(?=[A-Z{"\u201c])/);
  let removed = 0;
  const kept = sentences.filter((sentence) => {
    const plain = sentence.replace(/\{\{[^|}]+\|?/g, "").replace(/\}\}/g, "");
    const ok = extractFigures(plain).every((f) => allowed.has(f));
    if (!ok) removed++;
    return ok;
  });
  return { text: kept.join(" ").trim(), removed };
}

function fallbackMemo(graph: EntityGraph, market: MarketSnapshot | null): Memo {
  const entities = graph.nodes.filter((n) => !n.isCentral);
  const link = (n: Entity): MemoSpan => ({ text: n.name, entityId: n.id });
  const list = (items: Entity[]): MemoSpan[] =>
    items.flatMap((n, i) => [...(i > 0 ? [{ text: i === items.length - 1 ? " and " : ", " }] : []), link(n)]);
  const risks = entities.filter((n) => n.type === "risk" || n.severity === "high").slice(0, 4);
  const offsets = entities.filter((n) => n.type === "financial" || n.type === "company").filter((n) => !risks.includes(n)).slice(0, 3);
  const section = (key: MemoSectionKey, spans: MemoSpan[]): MemoSection => ({
    key,
    title: SECTIONS.find((s) => s.key === key)?.title ?? key,
    spans,
  });
  return {
    sections: [
      section("executive_summary", [{ text: `The map lists ${entities.length} entities drawn from ${graph.company.name}'s recent filings and news. The memo below is assembled from the map because the drafting step was unavailable.` }]),
      section("thesis", [{ text: "Review the high-severity entities first; each box links to the filing sentence it came from." }]),
      section("key_risks", risks.length ? [{ text: "Highest-severity items: " }, ...list(risks), { text: "." }] : [{ text: "No high-severity entities were found." }]),
      section("mitigants", offsets.length ? [{ text: "Counterparties and capital items to weigh against them: " }, ...list(offsets), { text: "." }] : [{ text: "No offsetting entities were found." }]),
      section("relative_value", [{ text: market ? marketFacts(market, graph.company.ticker).split("\n").slice(1).join(". ") + "." : "Market data was not available." }]),
    ],
  };
}

/** Drafts the five-section memo from the map and market facts. */
export async function generateMemo(graph: EntityGraph, market: MarketSnapshot | null): Promise<Memo> {
  const facts = `Company: ${graph.company.name} (${graph.company.ticker})\n\nEntities:\n${entityFacts(graph.nodes)}\n\n${marketFacts(market, graph.company.ticker)}`;
  const allowed = new Set([...extractFigures(facts), ...graph.nodes.flatMap((n) => extractFigures(n.sourceDate))]);
  const ids = new Set(graph.nodes.map((n) => n.id));
  const names = new Map(graph.nodes.map((n) => [n.id, n.name]));

  let best: { sections: MemoSection[]; removed: number } | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: unknown;
    try {
      const reminder = attempt > 0 ? "\n\nYour previous draft used numbers that are not in the facts. Use only numbers that appear in the facts." : "";
      raw = await generateJson(SYSTEM + reminder, facts, SCHEMA, { thinking: "low" });
    } catch {
      break;
    }
    if (typeof raw !== "object" || raw === null) continue;
    const record = raw as Record<string, unknown>;
    let removed = 0;
    const sections = SECTIONS.map(({ key, title }) => {
      const cleaned = dropUnsupported(typeof record[key] === "string" ? (record[key] as string) : "", allowed);
      removed += cleaned.removed;
      return { key, title, spans: toSpans(cleaned.text, ids, names) };
    });
    if (sections.some((s) => s.spans.length === 0)) continue;
    if (!best || removed < best.removed) best = { sections, removed };
    if (removed === 0) break;
  }
  return best ? { sections: best.sections } : fallbackMemo(graph, market);
}
