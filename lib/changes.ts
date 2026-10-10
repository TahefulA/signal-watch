import type { ChangeReport, Citation, DebtInstrument, Entity, EntityDiff, Report, SourceDocument } from "@/types";
import { money } from "./capital";
import { addDays } from "./dates";
import { type FilingRef, fetchFilingText, getSubmissions } from "./edgar";
import { extractFigures } from "./gemini";

/**
 * Change detection between two reports built from different filings. Model
 * output varies between runs, so an entity counts as new only when its name
 * does not appear anywhere in the earlier filings, and as removed only when it
 * does not appear anywhere in the current ones. Changed figures need a verified
 * quote on both sides.
 */

const SUFFIXES = new Set(["inc", "corp", "corporation", "co", "company", "llc", "lp", "ltd", "plc", "pbc", "the", "and", "of", "a", "an"]);

/** Lower-cased words with a crude plural stem, so "tariffs" matches "tariff". */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0)
    .map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

function keyWords(name: string): string[] {
  return words(name).filter((w) => !SUFFIXES.has(w));
}

/** Entity resolution: "Anthropic PBC" and "Anthropic" are the same; so are names sharing most key words. */
export function sameEntity(a: string, b: string): boolean {
  const ka = keyWords(a);
  const kb = keyWords(b);
  if (ka.length === 0 || kb.length === 0) return false;
  if (ka.join(" ") === kb.join(" ")) return true;
  const sa = new Set(ka);
  const sb = new Set(kb);
  const shared = ka.filter((w) => sb.has(w)).length;
  const smaller = Math.min(sa.size, sb.size);
  // "Fluidstack" vs "Fluidstack Ltd" (subset), or "NY Data Center Moratorium" vs "New York Data Center Moratorium".
  if (shared === smaller && smaller >= 1 && (smaller >= 2 || ka.length === 1 || kb.length === 1)) return true;
  return shared / new Set([...ka, ...kb]).size >= 0.6;
}

/**
 * True when a document mentions the entity: the full name, or every key word
 * within one sentence. Generic names such as "Construction Risks" are matched the same way.
 */
function mentions(sentences: string[][], name: string): boolean {
  const key = keyWords(name);
  if (key.length === 0) return true;
  return sentences.some((sentence) => key.every((w) => sentence.includes(w)));
}

interface FilingWords {
  sentences: string[][];
  /** Every filing's words joined, for finding a quote that spans line breaks. */
  joined: string;
}

/** True when the filings contain the passage, ignoring punctuation and spacing. */
function containsPassage(text: FilingWords, quote: string): boolean {
  const needle = words(quote).join(" ");
  return needle.length > 0 && text.joined.includes(needle);
}

/** Model-named entities such as "Construction Delays" are compared by their evidence, not their name. */
function isDescriptive(e: Entity): boolean {
  return e.type === "risk" || e.type === "macro";
}

async function filingSentences(cik: string, sources: SourceDocument[]): Promise<FilingWords> {
  const submissions = await getSubmissions(cik);
  const refs = sources
    .filter((s) => s.sourceType !== "News")
    .map((s) => submissions.filings.find((f) => f.accession === s.id))
    .filter((f): f is FilingRef => f !== undefined);
  const sentences: string[][] = [];
  const all: string[] = [];
  for (const ref of refs) {
    for (const doc of await fetchFilingText(ref)) {
      for (const s of doc.text.split(/\n|(?<=[.!?])\s+/)) if (s.length > 20) sentences.push(words(s));
      all.push(words(doc.text).join(" "));
    }
  }
  return { sentences, joined: all.join(" | ") };
}

function citationOf(e: Entity): Citation {
  return { quote: e.sourceQuote, sourceType: e.sourceType, sourceDate: e.sourceDate, sourceUrl: e.sourceUrl, sourceLabel: e.sourceLabel, page: e.sourcePage ?? null };
}

function figuresOf(label: string): string {
  return extractFigures(label).join(" ");
}

/** Units in a magnitude label; two labels are comparable only when these match ("1 GW" and "1,000 MW" are not). */
function unitsOf(label: string): string {
  return Array.from(new Set((label.toLowerCase().match(/%|\$|\b(mw|gw|kw|million|billion|thousand|shares?|years?|acres?|sites?)\b/g) ?? []).map((u) => u.replace(/s$/, ""))))
    .sort()
    .join(" ");
}

const SEVERITY_RANK: Record<Entity["severity"], number> = { none: 0, low: 1, medium: 2, high: 3 };

function amount(i: DebtInstrument): string | undefined {
  if (i.outstanding !== null) return money(i.outstanding);
  if (i.commitment !== null) return `${money(i.commitment)} commitment`;
  return undefined;
}

function diffDebt(before: DebtInstrument[], after: DebtInstrument[]): EntityDiff[] {
  const out: EntityDiff[] = [];
  const match = (a: DebtInstrument, list: DebtInstrument[]) =>
    list.find((b) => sameEntity(a.name, b.name) && (a.maturity ?? "").slice(0, 4) === (b.maturity ?? "").slice(0, 4));
  for (const a of after) {
    const b = match(a, before);
    if (!b) {
      out.push({ kind: "new_debt", name: a.name, detail: "New in the debt note.", after: amount(a), citations: a.citations.slice(0, 1) });
    } else if (a.outstanding !== null && b.outstanding !== null && Math.abs(a.outstanding - b.outstanding) >= 1e6) {
      out.push({
        kind: "debt_amount",
        name: a.name,
        detail: `Outstanding principal changed.`,
        before: amount(b),
        after: amount(a),
        citations: [...b.citations.slice(0, 1), ...a.citations.slice(0, 1)],
      });
    }
  }
  for (const b of before) {
    if (!match(b, after)) {
      out.push({ kind: "repaid_debt", name: b.name, detail: "No longer listed in the debt note.", before: amount(b), citations: b.citations.slice(0, 1) });
    }
  }
  return out;
}

/** Compares the current report with a baseline built from earlier filings, and marks the current map. */
export async function diffReports(current: Report, baseline: Report): Promise<{ changes: ChangeReport; removed: Entity[] }> {
  const cik = current.graph.company.cik;
  const [beforeText, afterText] = await Promise.all([filingSentences(cik, baseline.sources), filingSentences(cik, current.sources)]);

  const changes: EntityDiff[] = [];
  const mentionedBefore: string[] = [];
  const removed: Entity[] = [];
  const filingNodes = (r: Report) => r.graph.nodes.filter((n) => !n.isCentral && n.sourceType !== "News");
  const beforeNodes = filingNodes(baseline);

  for (const node of filingNodes(current)) {
    const prior = beforeNodes.find((b) => sameEntity(b.name, node.name));
    if (!prior) {
      const seenBefore = isDescriptive(node) ? containsPassage(beforeText, node.sourceQuote) : mentions(beforeText.sentences, node.name);
      if (seenBefore) mentionedBefore.push(node.name);
      else
        changes.push({
          kind: "new",
          entityId: node.id,
          name: node.name,
          detail: isDescriptive(node) ? "This disclosure is not in the earlier filings." : "Not mentioned in the earlier filings.",
          citations: [citationOf(node)],
        });
      continue;
    }
    const sourceMoved = prior.sourceDate !== node.sourceDate;
    if (
      prior.magnitude &&
      node.magnitude &&
      prior.magnitude.kind === node.magnitude.kind &&
      unitsOf(prior.magnitude.label) === unitsOf(node.magnitude.label) &&
      prior.magnitude.citation.quote !== node.magnitude.citation.quote &&
      figuresOf(prior.magnitude.label) !== figuresOf(node.magnitude.label)
    ) {
      changes.push({
        kind: "magnitude",
        entityId: node.id,
        name: node.name,
        detail: "Disclosed figure changed.",
        before: prior.magnitude.label,
        after: node.magnitude.label,
        citations: [prior.magnitude.citation, node.magnitude.citation],
      });
    }
    // Severity and relationship are Gemini's judgments; only report a change backed by newer evidence.
    if (sourceMoved && prior.severity !== node.severity && prior.severity !== "none" && node.severity !== "none") {
      changes.push({
        kind: "severity",
        judgment: true,
        entityId: node.id,
        name: node.name,
        detail: `Gemini rated severity ${node.severity}, up from ${prior.severity}.`.replace(", up from", SEVERITY_RANK[node.severity] < SEVERITY_RANK[prior.severity] ? ", down from" : ", up from"),
        before: prior.severity,
        after: node.severity,
        citations: [citationOf(prior), citationOf(node)],
      });
    }
    if (sourceMoved && prior.relationType && node.relationType && prior.relationType !== node.relationType) {
      changes.push({
        kind: "relationship",
        judgment: true,
        entityId: node.id,
        name: node.name,
        detail: "Gemini described the relationship differently.",
        before: prior.relationship,
        after: node.relationship,
        citations: [citationOf(prior), citationOf(node)],
      });
    }
  }

  for (const prior of beforeNodes) {
    if (filingNodes(current).some((n) => sameEntity(n.name, prior.name))) continue;
    if (isDescriptive(prior) ? containsPassage(afterText, prior.sourceQuote) : mentions(afterText.sentences, prior.name)) continue;
    // Removal is the stronger claim, so it also needs most of the name's words to be gone from the current filings.
    const key = keyWords(prior.name);
    if (key.filter((w) => afterText.joined.includes(` ${w} `)).length * 2 >= key.length) continue;
    changes.push({ kind: "removed", name: prior.name, detail: "No longer mentioned in the current filings.", citations: [citationOf(prior)] });
    removed.push({ ...prior, id: `removed-${prior.id}`, change: { kind: "removed", details: ["No longer mentioned in the current filings."] } });
  }

  changes.push(...diffDebt(baseline.capital?.instruments ?? [], current.capital?.instruments ?? []));

  const baselineIds = new Set(baseline.sources.map((s) => s.id));
  return {
    changes: {
      baselineId: baseline.id,
      baselineAsOf: baseline.asOf ?? baseline.generatedAt.slice(0, 10),
      baselineFilings: baseline.sources.filter((s) => s.sourceType !== "News"),
      newFilings: current.sources.filter((s) => s.sourceType !== "News" && !baselineIds.has(s.id)),
      changes,
      mentionedBefore,
      comparedAt: new Date().toISOString(),
    },
    removed,
  };
}

/** Writes change markers onto the current map's boxes and adds faded boxes for removed entities. */
export function applyChanges(report: Report, changes: ChangeReport, removed: Entity[]): Report {
  const central = report.graph.nodes.find((n) => n.isCentral);
  const nodes = report.graph.nodes.map((n) => {
    // Only changes in the filings' facts mark a box; changes in Gemini's ratings are listed in the change panel.
    const own = changes.changes.filter((c) => c.entityId === n.id && !c.judgment);
    if (own.length === 0) return { ...n, change: null };
    const isNew = own.some((c) => c.kind === "new");
    const details = own.map((c) => (c.before && c.after ? `${c.detail} ${c.before} → ${c.after}` : c.detail));
    return { ...n, change: { kind: isNew ? ("new" as const) : ("changed" as const), details } };
  });
  const ghostNodes = removed.filter((r) => !nodes.some((n) => n.id === r.id));
  const edges = [
    ...report.graph.edges.filter((e) => !e.target.startsWith("removed-")),
    ...(central ? ghostNodes.map((g) => ({ id: `${central.id}->${g.id}`, source: central.id, target: g.id, relationship: g.relationship })) : []),
  ];
  return { ...report, changes, graph: { ...report.graph, nodes: [...nodes.filter((n) => !n.id.startsWith("removed-")), ...ghostNodes], edges } };
}

/** The baseline date: the day before the newest 10-K or 10-Q the current report read. */
export function baselineDate(report: Report): string | null {
  const periodic = report.sources.filter((s) => s.sourceType === "10-K" || s.sourceType === "10-Q").map((s) => s.date).sort();
  const latest = periodic.at(-1);
  return latest ? addDays(latest, -1) : null;
}
