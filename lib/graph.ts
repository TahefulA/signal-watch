import type {
  CapitalStructure,
  Citation,
  DebtInstrument,
  CompanyProfile,
  Confidence,
  CreditRating,
  Entity,
  EntityEdge,
  EntityGraph,
  Magnitude,
  RelationDetail,
  Strategic,
  Trend,
  Validation,
} from "@/types";
import { RELATION_DETAILS } from "@/types/entity";
import { money } from "./capital";
import { cite, figuresSupported, pageOf, paragraphAround } from "./citations";
import type { CorpusDoc } from "./corpus";
import type { Extraction, RawEntity } from "./extraction";
import { extractFigures } from "./gemini";
import { isAcronym, keyWords, sameEntity, words } from "./names";
import { verifyQuote } from "./quotes";

export interface BuildResult {
  graph: EntityGraph;
  /** What citation validation and entity resolution did, for the indicator above the map. */
  validation: Validation;
}

/**
 * Words a qualified relationship needs in the entity's quotes. Without them the
 * relationship falls back to the plain label.
 */
const QUALIFIERS: Partial<Record<RelationDetail, { pattern: RegExp; fallback: RelationDetail | null }>> = {
  SOLE_SUPPLIER_OF: { pattern: /\b(sole|only|exclusive|single)\b/i, fallback: "SUPPLIES_TO" },
  PRIMARY_SUPPLIER_OF: { pattern: /\b(primary|principal|main)\b/i, fallback: "SUPPLIES_TO" },
  SECONDARY_SUPPLIER_OF: { pattern: /\b(secondary|backup|alternative|alternate)\b/i, fallback: "SUPPLIES_TO" },
  ANCHOR_TENANT_OF: { pattern: /\banchor\b/i, fallback: "CUSTOMER_OF" },
  MAJOR_CUSTOMER_OF: { pattern: /\b(major|significant|largest|principal|concentrat\w*)\b/i, fallback: "CUSTOMER_OF" },
  TRIAL_CUSTOMER_OF: { pattern: /\b(trial|pilot)\b/i, fallback: "CUSTOMER_OF" },
  GUARANTEES: { pattern: /\bguarant/i, fallback: "PROVIDES_CREDIT_SUPPORT_TO" },
  PROVIDES_CREDIT_SUPPORT_TO: { pattern: /\b(credit support|credit enhancement|backstop)/i, fallback: "PARTNERS_WITH" },
  // A competitor with no sentence saying so is rejected: a headline listing stock moves is not competition.
  DIRECT_COMPETITOR_OF: { pattern: /\bcompet/i, fallback: null },
  INDIRECT_COMPETITOR_OF: { pattern: /\bcompet/i, fallback: null },
  COMPETES_WITH: { pattern: /\bcompet/i, fallback: null },
  JOINT_VENTURE_WITH: { pattern: /\bjoint venture/i, fallback: "PARTNERS_WITH" },
};

/** Follows fallbacks until the label is supported by the passages; null when the claim cannot stand. */
function verifiedDetail(detail: RelationDetail, passages: string): RelationDetail | null {
  let current: RelationDetail | null = detail;
  for (let i = 0; i < 4 && current; i++) {
    const rule: { pattern: RegExp; fallback: RelationDetail | null } | undefined = QUALIFIERS[current];
    if (!rule || rule.pattern.test(passages)) return current;
    current = rule.fallback;
  }
  return current;
}

const DEFAULT_DETAIL: Record<string, RelationDetail> = {
  CUSTOMER_OF: "CUSTOMER_OF",
  SUPPLIES_TO: "SUPPLIES_TO",
  LENDS_TO: "LENDS_TO",
  GUARANTEES: "PROVIDES_CREDIT_SUPPORT_TO",
  REGULATES: "REGULATED_BY",
  COMPETES_WITH: "COMPETES_WITH",
  OWNED_BY: "OWNS",
  PARTNERS_WITH: "PARTNERS_WITH",
  AFFILIATED_WITH: "EXECUTIVE_OF",
  IMPACTS: "EXPOSED_TO",
};

/** True when the quote names the entity: its key words, or its initials. */
function namedIn(name: string, quote: string): boolean {
  const key = keyWords(name);
  const w = new Set(words(quote));
  return key.length > 0 && key.filter((k) => w.has(k)).length * 2 >= key.length;
}

function confidenceOf(sourceType: string, explicit: boolean, named: boolean): { confidence: Confidence; basis: string } {
  const filing = sourceType !== "News";
  const where = filing ? `a ${sourceType} sentence` : "a news headline";
  if (filing && explicit && named) return { confidence: "high", basis: `Stated in ${where} that names it` };
  if (filing) return { confidence: "medium", basis: explicit ? `Stated in ${where}, which does not name it directly` : `Inferred from ${where}` };
  if (explicit) return { confidence: "medium", basis: `Stated in ${where}; not confirmed by a filing` };
  return { confidence: "low", basis: `Inferred from ${where}` };
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "entity";
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Entity resolution within one type: same key words, a subset of them, or an acronym. */
function resolvesTo(a: Entity, raw: RawEntity): string | null {
  if (a.type !== raw.type) return null;
  if (isAcronym(raw.name.trim(), a.name) || isAcronym(a.name.trim(), raw.name)) return "acronym";
  // A one-word name only absorbs a longer one when the word is distinctive, so "Power" never swallows "Power Authority".
  const short = keyWords(a.name).length === 1 ? a.name : keyWords(raw.name).length === 1 ? raw.name : null;
  if (short && (keyWords(short)[0] ?? "").length < 5) return normalizeName(a.name) === normalizeName(raw.name) ? "same name" : null;
  return sameEntity(a.name, raw.name) ? "same key words" : null;
}

function sentenceCase(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function docFor(byId: Map<string, CorpusDoc>, ref: string | null): CorpusDoc | undefined {
  return ref ? byId.get(ref.replace(/[[\]]/g, "").trim()) : undefined;
}

const RANKING = /\b(largest|sole|only|main|biggest|primary|majority|principal|earliest|latest|highest|lowest|smallest|first)\b/gi;

/** True when the analysis ranks the entity with a word none of its quotes use. */
export function unsupportedRanking(text: string, passages: string[]): boolean {
  const quoted = passages.join(" ").toLowerCase();
  return Array.from(text.matchAll(RANKING)).some((m) => !new RegExp(`\\b${m[1].toLowerCase()}\\b`).test(quoted));
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
  const analysis = (text: string | null) => (text && figuresSupported(text, passages) && !unsupportedRanking(text, passages) ? text : null);

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

/** The industry phrase only if it is part of the company's own description. */
function verifiedIndustry(phrase: string | null, subjectQuote: string): string | null {
  if (!phrase || phrase.split(/\s+/).length > 10) return null;
  // Every word of the phrase must appear, in order, in the company's own description.
  const quoteWords = subjectQuote.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  let at = 0;
  for (const w of phrase.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
    const found = quoteWords.indexOf(w, at);
    if (found < 0) return null;
    at = found + 1;
  }
  return phrase.trim();
}

/** Ratings whose quote is found and contains both the agency and the rating. */
function verifiedRatings(extraction: Extraction, byId: Map<string, CorpusDoc>): CreditRating[] {
  const out: CreditRating[] = [];
  for (const r of extraction.ratings) {
    const citation = cite(docFor(byId, r.doc), r.quote);
    if (!citation) continue;
    const q = citation.quote.toLowerCase();
    const agencyWord = r.agency.toLowerCase().split(/[^a-z]+/).find((w) => w.length >= 3) ?? r.agency.toLowerCase();
    if (!q.includes(r.rating.toLowerCase()) || !q.includes(agencyWord)) continue;
    out.push({ agency: r.agency, rating: r.rating, outlook: r.outlook, subject: r.subject, citation });
  }
  return out;
}

/**
 * Builds the map from Gemini's extraction. An entity survives only if its quote
 * is found in the document it cites; the quote shown is the source's own text.
 */
export function buildGraph(company: CompanyProfile, extraction: Extraction, docs: CorpusDoc[]): BuildResult {
  const byId = new Map(docs.map((d) => [d.id, d]));
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
    fiscalPeriod: subjectDoc?.fiscalPeriod ?? null,
    confidence: "high",
    confidenceBasis: "The subject company",
  });

  const subjectNames = new Set([normalizeName(company.name), normalizeName(company.ticker), "company"]);
  const validation: Validation = { proposed: extraction.nodes.length, kept: 0, rejected: [], merges: [] };

  for (const raw of extraction.nodes) {
    const key = normalizeName(raw.name);
    if (!key || subjectNames.has(key) || sameEntity(raw.name, company.name)) continue;
    const doc = byId.get(raw.source_doc.replace(/[[\]]/g, "").trim());
    const quote = doc ? verifyQuote(raw.source_quote, doc.text, doc.sentences) : null;
    if (!doc || !quote) {
      validation.rejected.push({
        name: raw.name,
        reason: doc ? `Quote not found in ${doc.sourceType} ${doc.label}` : `Cited a document that was not provided (${raw.source_doc})`,
        quote: raw.source_quote,
      });
      continue;
    }
    const context = verifiedContext(raw, byId, quote);

    const existing = nodes.find((n) => !n.isCentral && resolvesTo(n, raw));
    if (existing) {
      const reason = resolvesTo(existing, raw) ?? "same key words";
      validation.merges.push({ kept: existing.name, merged: raw.name, reason });
      existing.aliases = [...(existing.aliases ?? []), raw.name.trim()];
      // Keep the first entity's evidence; fill only what it lacks. Duplicated figures are never added together.
      if (!existing.magnitude && context.magnitude) existing.magnitude = context.magnitude;
      nameToId.set(key, existing.id);
      continue;
    }

    const sourceContext = doc.sourceType === "News" ? null : paragraphAround(doc.text, quote);
    const passages = [quote, sourceContext ?? "", context.magnitude?.citation.quote ?? "", context.strategic.protection?.citation.quote ?? ""].join(" ");
    const detail = verifiedDetail(raw.relation_detail ?? DEFAULT_DETAIL[raw.relation_type] ?? "PARTNERS_WITH", passages);
    if (!detail) {
      validation.rejected.push({ name: raw.name, reason: "Called a competitor, but no cited sentence says it competes", quote });
      continue;
    }
    const descriptive = raw.type === "risk" || raw.type === "macro";
    const { confidence, basis } = confidenceOf(doc.sourceType, raw.explicitness === "explicit", descriptive || namedIn(raw.name, quote));
    const headline =
      raw.headline && figuresSupported(raw.headline, [passages]) && !unsupportedRanking(raw.headline, [passages]) ? raw.headline : null;
    const parentCitation = raw.parent_name ? cite(docFor(byId, raw.parent_doc), raw.parent_quote) : null;

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
      relationType: RELATION_DETAILS[detail],
      relationDetail: detail,
      headline,
      fiscalPeriod: doc.fiscalPeriod ?? null,
      confidence,
      confidenceBasis: basis,
      parent:
        raw.parent_name && parentCitation && namedIn(raw.parent_name, parentCitation.quote)
          ? { name: raw.parent_name, citation: parentCitation }
          : null,
      sourcePage: doc.sourceType === "News" ? null : pageOf(doc.fullText, quote),
      sourceContext,
      ...context,
    });
  }
  validation.kept = nodes.length - 1;

  company.industry = verifiedIndustry(extraction.industry_phrase, subjectQuote);
  company.ratings = verifiedRatings(extraction, byId);

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

  return { graph: { company, nodes, edges }, validation };
}

const DEBT_DETAIL: Record<DebtInstrument["kind"], RelationDetail> = {
  revolver: "HAS_CREDIT_FACILITY_WITH",
  term_loan: "LENDS_TO",
  secured_notes: "LENDS_TO",
  unsecured_notes: "LENDS_TO",
  convertible_notes: "LENDS_TO",
  other: "LENDS_TO",
};

/**
 * Adds each debt instrument from the capital structure as its own box, merging
 * with a financing box Gemini already found. Severity is set by a stated rule:
 * medium when the instrument matures within three years of the balance sheet date.
 */
export function addDebtNodes(graph: EntityGraph, capital: CapitalStructure | null, validation: Validation): EntityGraph {
  if (!capital) return graph;
  const central = graph.nodes.find((n) => n.isCentral);
  if (!central) return graph;
  const nodes = [...graph.nodes];
  const edges = [...graph.edges];
  const asOfYear = Number((capital.asOf ?? capital.sourceDate).slice(0, 4));
  for (const i of capital.instruments) {
    const citation = i.citations[0];
    if (!citation) continue;
    // Parsed amounts, so a table figure in thousands reads as dollars.
    const label = i.outstanding !== null ? `${money(i.outstanding)} principal` : i.commitment !== null ? `${money(i.commitment)} commitment` : null;
    const magnitude = label ? { kind: "balance_sheet" as const, label, citation } : null;
    const near = i.maturity !== null && Number(i.maturity.slice(0, 4)) - asOfYear <= 3;
    const existing = nodes.find((n) => n.type === "financial" && !n.isCentral && sameEntity(n.name, i.name));
    if (existing) {
      validation.merges.push({ kept: existing.name, merged: i.name, reason: "same instrument in the debt note" });
      existing.magnitude = existing.magnitude ?? magnitude;
      existing.aliases = [...(existing.aliases ?? []), i.name];
      continue;
    }
    let id = `debt-${slug(i.name)}`;
    while (nodes.some((n) => n.id === id)) id = `${id}-x`;
    nodes.push({
      id,
      name: i.name,
      type: "financial",
      relationship: [i.coupon, i.maturity ? `due ${i.maturity.slice(0, 4)}` : null].filter(Boolean).join(", ") || "Debt instrument",
      severity: near ? "medium" : "low",
      sourceType: citation.sourceType,
      sourceDate: citation.sourceDate,
      sourceQuote: citation.quote,
      sourceUrl: citation.sourceUrl,
      sourceLabel: citation.sourceLabel,
      sourcePage: citation.page ?? null,
      sourceContext: null,
      fiscalPeriod: capital.fiscalPeriod ?? null,
      relationType: "LENDS_TO",
      relationDetail: DEBT_DETAIL[i.kind],
      headline: near ? `Matures within three years of ${capital.asOf ?? capital.sourceDate}` : null,
      confidence: "high",
      confidenceBasis: `Stated in the ${citation.sourceType} debt note`,
      magnitude,
      trend: "unknown",
      trendCitation: null,
      strategic: {
        whyItMatters: null,
        ifItDisappeared: null,
        protection: null,
      },
      parent: null,
    });
    edges.push({ id: `${central.id}->${id}`, source: central.id, target: id, relationship: "Debt instrument" });
    validation.debtAdded = (validation.debtAdded ?? 0) + 1;
  }
  return { ...graph, nodes, edges };
}
