import type { ChangeReport, Citation, DebtInstrument, Entity, EntityDiff, Report, SourceDocument, Trend } from "@/types";
import { money } from "./capital";
import { addDays } from "./dates";
import { type FilingRef, fetchFilingText, getSubmissions } from "./edgar";
import { extractFigures } from "./gemini";
import { keyWords, sameEntity, words } from "./names";

export { sameEntity };

/**
 * Change detection between two reports built from different filings. Model
 * output varies between runs, so an entity counts as new only when its name
 * does not appear anywhere in the earlier filings, and as removed only when it
 * does not appear anywhere in the current ones. Changed figures need a verified
 * quote on both sides.
 */

/**
 * True when a document mentions the entity: the full name, or every key word
 * within one sentence. Generic names such as "Construction Risks" are matched the same way.
 */
export function mentions(sentences: string[][], name: string): boolean {
  const key = keyWords(name);
  if (key.length === 0) return true;
  return sentences.some((sentence) => key.every((w) => sentence.includes(w)));
}

export interface FilingWords {
  sentences: string[][];
  /** Every filing's words joined, for finding a quote that spans line breaks. */
  joined: string;
}

/** True when the filings contain the passage, ignoring punctuation and spacing. */
export function containsPassage(text: FilingWords, quote: string): boolean {
  const needle = words(quote).join(" ");
  return needle.length > 0 && text.joined.includes(needle);
}

/**
 * True when the filings contain a sentence sharing at least 60% of the passage's
 * words: risk factors are reworded slightly from one filing to the next.
 */
export function similarPassage(text: FilingWords, quote: string): boolean {
  const wanted = new Set(words(quote).filter((w) => w.length > 3));
  if (wanted.size < 5) return false;
  return text.sentences.some((sentence) => {
    let shared = 0;
    for (const w of new Set(sentence)) if (wanted.has(w)) shared++;
    return shared / wanted.size >= 0.6;
  });
}

/** Model-named entities such as "Construction Delays" are compared by their evidence, not their name. */
export function isDescriptive(e: Entity): boolean {
  return e.type === "risk" || e.type === "macro";
}

export interface FilingDoc {
  sourceType: "10-K" | "10-Q" | "8-K";
  date: string;
  url: string;
  text: string;
}

/** The full text of the filings a report read, fetched again from EDGAR (or the local cache). */
export async function loadFilingDocs(cik: string, sources: SourceDocument[]): Promise<FilingDoc[]> {
  const submissions = await getSubmissions(cik);
  const refs = sources
    .filter((s) => s.sourceType !== "News")
    .map((s) => submissions.filings.find((f) => f.accession === s.id))
    .filter((f): f is FilingRef => f !== undefined);
  const docs: FilingDoc[] = [];
  for (const ref of refs) {
    for (const doc of await fetchFilingText(ref)) {
      docs.push({ sourceType: ref.form as FilingDoc["sourceType"], date: ref.filingDate, url: doc.url, text: doc.text });
    }
  }
  return docs;
}

/** A sentence from the filings that names the entity, as a citation, or null when none does. */
export function findMention(docs: FilingDoc[], name: string): Citation | null {
  const key = keyWords(name);
  if (key.length === 0) return null;
  for (const doc of docs) {
    for (const sentence of doc.text.split(/\n|(?<=[.!?])\s+(?=[A-Z“"(])/)) {
      if (sentence.length < 40 || sentence.length > 400) continue;
      const w = words(sentence);
      if (key.every((k) => w.includes(k))) {
        return { quote: sentence.trim(), sourceType: doc.sourceType, sourceDate: doc.date, sourceUrl: doc.url, sourceLabel: "Filing text", page: null };
      }
    }
  }
  return null;
}

/** Sentence word lists and joined words for a set of document texts. */
export function filingWordsOf(texts: string[]): FilingWords {
  const sentences: string[][] = [];
  const all: string[] = [];
  for (const text of texts) {
    for (const s of text.split(/\n|(?<=[.!?])\s+/)) if (s.length > 20) sentences.push(words(s));
    all.push(words(text).join(" "));
  }
  return { sentences, joined: all.join(" | ") };
}

async function filingSentences(cik: string, sources: SourceDocument[]): Promise<FilingWords> {
  const sentences: string[][] = [];
  const all: string[] = [];
  for (const doc of await loadFilingDocs(cik, sources)) {
    for (const s of doc.text.split(/\n|(?<=[.!?])\s+/)) if (s.length > 20) sentences.push(words(s));
    all.push(words(doc.text).join(" "));
  }
  return { sentences, joined: all.join(" | ") };
}

function citationOf(e: Entity): Citation {
  return { quote: e.sourceQuote, sourceType: e.sourceType, sourceDate: e.sourceDate, sourceUrl: e.sourceUrl, sourceLabel: e.sourceLabel, page: e.sourcePage ?? null };
}

function figuresOf(label: string): string {
  return extractFigures(label).join(" ");
}

const GENERIC_CAPS = new Set(["The", "Company", "Our", "We", "In", "Under", "As", "On", "For", "MW", "GW", "IT", "AI", "HPC", "Inc", "LLC", "Notes", "Data", "Center", "Campus"]);

/** Capitalised words after the first, minus the entity's own name and generic words. */
function properNouns(quote: string, entityName: string): Set<string> {
  const own = new Set(entityName.split(/[^A-Za-z0-9]+/).map((w) => w.toLowerCase()));
  const tokens = quote.split(/[^A-Za-z0-9]+/).filter(Boolean).slice(1);
  return new Set(tokens.filter((w) => /^[A-Z][a-z]+/.test(w) && !GENERIC_CAPS.has(w) && !own.has(w.toLowerCase())));
}

/**
 * True when two quotes describe the same thing: they share a proper noun beyond
 * the entity's name ("Lake Mariner"), so 168 MW in Abernathy and 378 MW at Lake
 * Mariner are not read as one figure changing.
 */
function sameSubject(a: string, b: string, entityName: string): boolean {
  const pa = properNouns(a, entityName);
  const pb = properNouns(b, entityName);
  if (pa.size === 0 && pb.size === 0) return true;
  for (const w of pa) if (pb.has(w)) return true;
  return false;
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

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function baseName(i: DebtInstrument): string {
  return i.name.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * True when filings mention an instrument: by its maturity date written out
 * ("June 1, 2033"), or by name without qualifiers such as "(Jun)" when no other
 * instrument shares that name.
 */
function mentionsDebt(text: FilingWords, i: DebtInstrument, all: DebtInstrument[]): boolean {
  const m = i.maturity?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m && text.joined.includes(words(`${MONTHS[Number(m[2]) - 1]} ${Number(m[3])} ${m[1]}`).join(" "))) return true;
  const ambiguous = all.filter((x) => sameEntity(baseName(x), baseName(i))).length > 1;
  return !ambiguous && mentions(text.sentences, baseName(i));
}

const RETIRED = /\b(repaid|repay|terminated|terminate|extinguishment|redeemed|retired|matured|paid off)\b/;

/** True when a current filing says the instrument was repaid, redeemed or terminated. */
function describedAsRetired(text: FilingWords, i: DebtInstrument): boolean {
  const key = keyWords(baseName(i));
  return text.sentences.some((s) => key.every((k) => s.includes(k)) && RETIRED.test(s.join(" ")));
}

function diffDebt(before: DebtInstrument[], after: DebtInstrument[], beforeText: FilingWords, afterText: FilingWords): EntityDiff[] {
  const out: EntityDiff[] = [];
  const year = (i: DebtInstrument) => (i.maturity ?? "").slice(0, 4);
  // Gemini names the same notes differently between runs ("2029 Convertible Notes", "4.25% Convertible
  // Senior Notes due 2029"), so the same kind and maturity year also count as a match.
  const match = (a: DebtInstrument, list: DebtInstrument[]) =>
    list.find((b) => year(a) === year(b) && (sameEntity(a.name, b.name) || (a.kind === b.kind && year(a) !== "")));
  for (const a of after) {
    const b = match(a, before);
    if (!b) {
      if (mentionsDebt(beforeText, a, after)) continue;
      out.push({ kind: "new_debt", name: a.name, detail: "New in the debt note.", after: amount(a), citations: a.citations.slice(0, 1) });
    } else if (
      a.outstanding !== null &&
      b.outstanding !== null &&
      Math.abs(a.outstanding - b.outstanding) >= 1e6 &&
      // Two notes of the same kind can mature in the same year; compare amounts only for an unambiguous pair.
      (sameEntity(a.name, b.name) || before.filter((x) => x.kind === a.kind && year(x) === year(a)).length === 1)
    ) {
      out.push({
        kind: "debt_amount",
        name: a.name,
        detail: "Outstanding principal changed.",
        before: amount(b),
        after: amount(a),
        citations: [...b.citations.slice(0, 1), ...a.citations.slice(0, 1)],
      });
    }
  }
  for (const b of before) {
    if (match(b, after)) continue;
    const retired = describedAsRetired(afterText, b);
    if (!retired && mentionsDebt(afterText, b, before)) continue;
    out.push({
      kind: "repaid_debt",
      name: b.name,
      detail: retired ? "Described as repaid or terminated in the current filings." : "No longer mentioned in the current filings.",
      before: amount(b),
      citations: b.citations.slice(0, 1),
    });
  }
  return out;
}

/** Compares the current report with a baseline built from earlier filings, and marks the current map. */
export async function diffReports(
  current: Report,
  baseline: Report,
): Promise<{ changes: ChangeReport; removed: Entity[]; trends: Map<string, { trend: Trend; basis: string }> }> {
  const cik = current.graph.company.cik;
  const [beforeText, afterText] = await Promise.all([filingSentences(cik, baseline.sources), filingSentences(cik, current.sources)]);

  const changes: EntityDiff[] = [];
  const mentionedBefore: string[] = [];
  const trends = new Map<string, { trend: Trend; basis: string }>();
  const removed: Entity[] = [];
  // Debt boxes are compared through the debt note below, not by name.
  const filingNodes = (r: Report) => r.graph.nodes.filter((n) => !n.isCentral && n.sourceType !== "News" && !n.id.startsWith("debt-"));
  const beforeNodes = filingNodes(baseline);

  for (const node of filingNodes(current)) {
    const prior = beforeNodes.find((b) => sameEntity(b.name, node.name));
    if (!prior) {
      const seenBefore = isDescriptive(node)
        ? containsPassage(beforeText, node.sourceQuote) || similarPassage(beforeText, node.sourceQuote)
        : mentions(beforeText.sentences, node.name) || (node.type === "financial" && similarPassage(beforeText, node.sourceQuote));
      if (seenBefore) mentionedBefore.push(node.name);
      else
        changes.push({
          kind: "new",
          entityId: node.id,
          name: node.name,
          detail: isDescriptive(node) || node.type === "financial" ? "This disclosure is not in the earlier filings." : "Not mentioned in the earlier filings.",
          citations: [citationOf(node)],
        });
      continue;
    }
    const sourceMoved = prior.sourceDate !== node.sourceDate;
    // Trend: the same kind of disclosed figure in both quarters, in the same units.
    const comparable =
      prior.magnitude !== null &&
      prior.magnitude !== undefined &&
      node.magnitude !== null &&
      node.magnitude !== undefined &&
      prior.magnitude.kind === node.magnitude.kind &&
      unitsOf(prior.magnitude.label) === unitsOf(node.magnitude.label) &&
      sameSubject(prior.magnitude.citation.quote, node.magnitude.citation.quote, node.name);
    if (comparable && prior.magnitude && node.magnitude) {
      const before = Number(extractFigures(prior.magnitude.label)[0]);
      const after = Number(extractFigures(node.magnitude.label)[0]);
      if (Number.isFinite(before) && Number.isFinite(after)) {
        const trend: Trend = after > before ? "increasing" : after < before ? "decreasing" : "stable";
        trends.set(node.id, { trend, basis: `Previous quarter: ${prior.magnitude.label}; now: ${node.magnitude.label}` });
      }
    }
    if (
      prior.magnitude &&
      node.magnitude &&
      comparable &&
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
    if (
      isDescriptive(prior)
        ? containsPassage(afterText, prior.sourceQuote) || similarPassage(afterText, prior.sourceQuote)
        : mentions(afterText.sentences, prior.name)
    ) {
      continue;
    }
    // Removal is the stronger claim, so it also needs most of the name's words to be gone from the current filings.
    const key = keyWords(prior.name);
    if (key.filter((w) => afterText.joined.includes(` ${w} `)).length * 2 >= key.length) continue;
    changes.push({ kind: "removed", name: prior.name, detail: "No longer mentioned in the current filings.", citations: [citationOf(prior)] });
    removed.push({ ...prior, id: `removed-${prior.id}`, change: { kind: "removed", details: ["No longer mentioned in the current filings."] } });
  }

  changes.push(...diffDebt(baseline.capital?.instruments ?? [], current.capital?.instruments ?? [], beforeText, afterText));

  const baselineIds = new Set(baseline.sources.map((s) => s.id));
  return {
    trends,
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
export function applyChanges(
  report: Report,
  changes: ChangeReport,
  removed: Entity[],
  trends: Map<string, { trend: Trend; basis: string }> = new Map(),
): Report {
  const central = report.graph.nodes.find((n) => n.isCentral);
  const withTrends = report.graph.nodes.map((n) => {
    const t = trends.get(n.id);
    if (t) return { ...n, trend: t.trend, trendBasis: t.basis };
    // A trend from an earlier comparison is cleared; one stated in the filing (trendCitation) stays.
    return n.trendBasis ? { ...n, trend: n.trendCitation ? n.trend : ("unknown" as const), trendBasis: null } : n;
  });
  const nodes = withTrends.map((n) => {
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
