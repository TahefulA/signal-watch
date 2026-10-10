import type { Citation, CompanyProfile, Entity, EntityEdge, EntityGraph, Magnitude, Strategic, Trend } from "@/types";
import { cite, figuresSupported, pageOf, paragraphAround } from "./citations";
import type { CorpusDoc } from "./corpus";
import type { Extraction, RawEntity } from "./extraction";
import { extractFigures } from "./gemini";
import { verifyQuote } from "./quotes";

export interface BuildResult {
  graph: EntityGraph;
  /** Entities Gemini proposed whose quote could not be found in the source. */
  dropped: string[];
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "entity";
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sentenceCase(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function docFor(byId: Map<string, CorpusDoc>, ref: string | null): CorpusDoc | undefined {
  return ref ? byId.get(ref.replace(/[[\]]/g, "").trim()) : undefined;
}

interface Context {
  magnitude: Magnitude | null;
  trend: Trend;
  trendCitation: Citation | null;
  strategic: Strategic;
}

/**
 * Keeps only context Gemini can back up: a magnitude whose every figure is in its
 * quote, a trend with a quote making the comparison, a protection with a quote,
 * and analysis sentences that introduce no figures of their own.
 */
function verifiedContext(raw: RawEntity, byId: Map<string, CorpusDoc>, mainQuote: string): Context {
  const magCitation = cite(docFor(byId, raw.magnitude_doc), raw.magnitude_quote);
  const magnitude =
    raw.magnitude_label && magCitation && extractFigures(raw.magnitude_label).length > 0 && figuresSupported(raw.magnitude_label, [magCitation.quote])
      ? { kind: raw.magnitude_kind ?? "other", label: raw.magnitude_label, citation: magCitation }
      : null;

  const trendCitation = raw.trend !== "unknown" ? cite(docFor(byId, raw.trend_doc), raw.trend_quote) : null;
  const protectionCitation = raw.protection ? cite(docFor(byId, raw.protection_doc), raw.protection_quote) : null;

  const passages = [mainQuote, magCitation?.quote ?? "", protectionCitation?.quote ?? ""];
  const analysis = (text: string | null) => (text && figuresSupported(text, passages) ? text : null);

  return {
    magnitude,
    trend: trendCitation ? raw.trend : "unknown",
    trendCitation,
    strategic: {
      whyItMatters: analysis(raw.why_it_matters),
      ifItDisappeared: analysis(raw.if_it_disappeared),
      protection: raw.protection && protectionCitation ? { text: raw.protection, citation: protectionCitation } : null,
    },
  };
}

/**
 * Builds the map from Gemini's extraction. An entity survives only if its quote
 * is found in the document it cites; the quote shown is the source's own text.
 */
export function buildGraph(company: CompanyProfile, extraction: Extraction, docs: CorpusDoc[]): BuildResult {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const dropped: string[] = [];
  const nodes: Entity[] = [];
  const nameToId = new Map<string, string>();
  const usedIds = new Set<string>();

  const subjectDoc = byId.get(extraction.subject_doc) ?? docs.find((d) => d.sourceType !== "News");
  const subjectQuote =
    (subjectDoc && extraction.subject_quote && verifyQuote(extraction.subject_quote, subjectDoc.text, subjectDoc.sentences)) ||
    subjectDoc?.sentences[0] ||
    "";
  const centralId = slug(company.ticker);
  usedIds.add(centralId);
  nodes.push({
    id: centralId,
    name: company.name,
    type: "company",
    relationship: company.ticker,
    severity: "none",
    sourceType: subjectDoc?.sourceType ?? "10-K",
    sourceDate: subjectDoc?.date ?? "",
    sourceQuote: subjectQuote,
    sourceUrl: subjectDoc?.url ?? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${company.cik}`,
    sourceLabel: subjectDoc?.label ?? "SEC EDGAR",
    isCentral: true,
    sourcePage: subjectDoc && subjectQuote ? pageOf(subjectDoc.fullText, subjectQuote) : null,
    sourceContext: subjectDoc && subjectQuote ? paragraphAround(subjectDoc.text, subjectQuote) : null,
  });

  const subjectNames = new Set([normalizeName(company.name), normalizeName(company.ticker), "company"]);

  for (const raw of extraction.nodes) {
    const key = normalizeName(raw.name);
    if (!key || nameToId.has(key) || subjectNames.has(key)) continue;
    const doc = byId.get(raw.source_doc.replace(/[[\]]/g, "").trim());
    const quote = doc ? verifyQuote(raw.source_quote, doc.text, doc.sentences) : null;
    if (!doc || !quote) {
      dropped.push(raw.name);
      continue;
    }
    let id = slug(raw.name);
    while (usedIds.has(id)) id = `${id}-x`;
    usedIds.add(id);
    nameToId.set(key, id);
    nodes.push({
      id,
      name: raw.name.trim(),
      type: raw.type,
      relationship: sentenceCase(raw.relationship),
      severity: raw.severity,
      sourceType: doc.sourceType,
      sourceDate: doc.date,
      sourceQuote: quote,
      sourceUrl: doc.url,
      sourceLabel: doc.label,
      relationType: raw.relation_type,
      sourcePage: doc.sourceType === "News" ? null : pageOf(doc.fullText, quote),
      sourceContext: doc.sourceType === "News" ? null : paragraphAround(doc.text, quote),
      ...verifiedContext(raw, byId, quote),
    });
  }

  const resolve = (name: string): string | undefined => {
    const key = normalizeName(name);
    if (subjectNames.has(key)) return centralId;
    return nameToId.get(key);
  };

  const edges: EntityEdge[] = [];
  const seen = new Set<string>();
  for (const raw of extraction.edges) {
    const source = resolve(raw.from);
    const target = resolve(raw.to);
    if (!source || !target || source === target || target === centralId) continue;
    const id = `${source}->${target}`;
    if (seen.has(id)) continue;
    seen.add(id);
    edges.push({ id, source, target, relationship: sentenceCase(raw.relationship) });
  }

  // Every entity hangs off the subject company unless the text linked it to another entity.
  for (const node of nodes) {
    if (node.isCentral || edges.some((e) => e.target === node.id)) continue;
    edges.push({ id: `${centralId}->${node.id}`, source: centralId, target: node.id, relationship: node.relationship });
  }

  return { graph: { company, nodes, edges }, dropped };
}
