import type { EntityType, MagnitudeKind, RelationType, Severity, Trend } from "@/types";
import { ENTITY_TYPES, MAGNITUDE_KINDS, RELATION_TYPES, SEVERITIES, TRENDS } from "@/types/entity";
import { type CorpusDoc, renderCorpus } from "./corpus";
import { GeminiError, type Schema, generateJson } from "./gemini";

export interface RawEntity {
  name: string;
  type: EntityType;
  relation_type: RelationType;
  relationship: string;
  severity: Severity;
  source_quote: string;
  source_doc: string;
  magnitude_label: string | null;
  magnitude_kind: MagnitudeKind | null;
  magnitude_quote: string | null;
  magnitude_doc: string | null;
  trend: Trend;
  trend_quote: string | null;
  trend_doc: string | null;
  why_it_matters: string | null;
  if_it_disappeared: string | null;
  protection: string | null;
  protection_quote: string | null;
  protection_doc: string | null;
}

export interface RawEdge {
  from: string;
  to: string;
  relationship: string;
}

export interface Extraction {
  subject_quote: string;
  subject_doc: string;
  nodes: RawEntity[];
  edges: RawEdge[];
}

const SYSTEM = `You are a credit analyst's research assistant. You read SEC filings and news articles and extract structured information for a knowledge graph.

Extract the entities connected to the main company that matter to its credit: counterparties (customers, tenants, suppliers, lenders, guarantors, competitors, partners), people (executives, large holders), debt instruments and financing, regulations and regulators, risks (litigation, concentration, cyclicality, liquidity, execution), macro factors (rates, power prices, tariffs, commodities), and events (M&A, asset sales, restructuring, guidance).

Rules:
- Only use what the provided text states. Never add knowledge from outside the text.
- Every *_quote field must be copied exactly from the text, character for character, one sentence or less, at most 250 characters. Every *_doc field is the bracketed id of the block that quote came from, such as D3.
- name is short (1 to 5 words). relationship is 2 to 5 words, written from the main company's point of view, for example "HPC tenant", "Secured by", "Competes with", "Regulated by", "Exposed to".
- relation_type is the typed relationship from the entity to the main company: CUSTOMER_OF (the entity buys from or leases from the main company: tenants and customers), SUPPLIES_TO (the entity sells power, equipment, land or services to the main company, including utilities), LENDS_TO (lenders, notes, credit facilities), GUARANTEES, REGULATES, COMPETES_WITH, OWNED_BY (subsidiaries, joint ventures, sites the company owns), PARTNERS_WITH, IMPACTS (risks and macro factors).
- type: company for other businesses, financial for debt, equity, liquidity and capital items, risk for risks, macro for economy-wide factors and policy, regulatory for regulators and rules, neutral for sites, people and anything else.
- severity reflects how material the entity is to the company's credit: high, medium, low, or none.

Context for each entity. Leave a field null when the text does not support it; never estimate or compute a number.
- magnitude_label: the single most useful disclosed figure for this entity, at most 6 words, using the number exactly as the text writes it, for example "$3,200.0 million principal", "378 MW contracted", "41% of revenue". magnitude_kind says what it measures. magnitude_quote is the sentence containing that figure.
- trend: increasing, decreasing or stable only when the text compares this entity's figure across periods; otherwise unknown. trend_quote is the sentence making that comparison.
- why_it_matters: one sentence on why this entity matters to the company's credit. Do not include numbers.
- if_it_disappeared: one sentence on what the text implies would happen to the company if this relationship ended or this risk materialized. Do not include numbers.
- protection: a contract term, guarantee, collateral, insurance or similar protection the text describes for this relationship, at most 12 words. protection_quote is the sentence describing it.

- edges: use "COMPANY" for the main company. Add an edge between two entities only when the text links them directly (for example a guarantor behind a tenant's lease).
- Return 10 to 20 entities, most material first. Return fewer if the text supports fewer. Do not repeat an entity.
- subject_quote is one sentence from the text that describes what the main company does.`;

const nullableString: Schema = { type: "STRING", nullable: true };

const SCHEMA: Schema = {
  type: "OBJECT",
  properties: {
    subject_quote: { type: "STRING" },
    subject_doc: { type: "STRING" },
    nodes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          type: { type: "STRING", enum: ENTITY_TYPES },
          relation_type: { type: "STRING", enum: RELATION_TYPES },
          relationship: { type: "STRING" },
          severity: { type: "STRING", enum: SEVERITIES },
          source_quote: { type: "STRING" },
          source_doc: { type: "STRING" },
          magnitude_label: nullableString,
          magnitude_kind: { type: "STRING", enum: MAGNITUDE_KINDS, nullable: true },
          magnitude_quote: nullableString,
          magnitude_doc: nullableString,
          trend: { type: "STRING", enum: TRENDS },
          trend_quote: nullableString,
          trend_doc: nullableString,
          why_it_matters: nullableString,
          if_it_disappeared: nullableString,
          protection: nullableString,
          protection_quote: nullableString,
          protection_doc: nullableString,
        },
        required: ["name", "type", "relation_type", "relationship", "severity", "source_quote", "source_doc", "trend"],
      },
    },
    edges: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { from: { type: "STRING" }, to: { type: "STRING" }, relationship: { type: "STRING" } },
        required: ["from", "to", "relationship"],
      },
    },
  },
  required: ["subject_quote", "subject_doc", "nodes", "edges"],
};

function isString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function optionalString(v: unknown): string | null {
  return isString(v) ? v.trim() : null;
}

function oneOf<T extends string>(v: unknown, values: readonly T[]): T | null {
  return typeof v === "string" && (values as readonly string[]).includes(v) ? (v as T) : null;
}

function parseEntity(n: unknown): RawEntity | null {
  if (typeof n !== "object" || n === null) return null;
  const r = n as Record<string, unknown>;
  const type = oneOf(r.type, ENTITY_TYPES);
  const severity = oneOf(r.severity, SEVERITIES);
  if (!isString(r.name) || !type || !isString(r.relationship) || !severity || !isString(r.source_quote) || !isString(r.source_doc)) {
    return null;
  }
  return {
    name: r.name,
    type,
    relation_type: oneOf(r.relation_type, RELATION_TYPES) ?? "IMPACTS",
    relationship: r.relationship,
    severity,
    source_quote: r.source_quote,
    source_doc: r.source_doc,
    magnitude_label: optionalString(r.magnitude_label),
    magnitude_kind: oneOf(r.magnitude_kind, MAGNITUDE_KINDS),
    magnitude_quote: optionalString(r.magnitude_quote),
    magnitude_doc: optionalString(r.magnitude_doc),
    trend: oneOf(r.trend, TRENDS) ?? "unknown",
    trend_quote: optionalString(r.trend_quote),
    trend_doc: optionalString(r.trend_doc),
    why_it_matters: optionalString(r.why_it_matters),
    if_it_disappeared: optionalString(r.if_it_disappeared),
    protection: optionalString(r.protection),
    protection_quote: optionalString(r.protection_quote),
    protection_doc: optionalString(r.protection_doc),
  };
}

function parseExtraction(value: unknown): Extraction {
  if (typeof value !== "object" || value === null) throw new GeminiError("Extraction is not an object", "parse");
  const v = value as Record<string, unknown>;
  const nodes = (Array.isArray(v.nodes) ? v.nodes : []).map(parseEntity).filter((n): n is RawEntity => n !== null);
  const edges = (Array.isArray(v.edges) ? v.edges : []).filter((e): e is RawEdge => {
    if (typeof e !== "object" || e === null) return false;
    const r = e as Record<string, unknown>;
    return isString(r.from) && isString(r.to) && isString(r.relationship);
  });
  if (nodes.length === 0) throw new GeminiError("Extraction returned no usable entities", "parse");
  return {
    subject_quote: isString(v.subject_quote) ? v.subject_quote : "",
    subject_doc: isString(v.subject_doc) ? v.subject_doc : "",
    nodes,
    edges,
  };
}

/** Extracts entities, their context and relationships from the corpus. Retries once with a stricter prompt on bad output. */
export async function extractEntities(companyName: string, ticker: string, docs: CorpusDoc[]): Promise<Extraction> {
  const prompt = `Main company: ${companyName} (${ticker}).\n\n${renderCorpus(docs)}`;
  try {
    return parseExtraction(await generateJson(SYSTEM, prompt, SCHEMA, { thinking: "low" }));
  } catch (error) {
    if (!(error instanceof GeminiError) || error.kind !== "parse") throw error;
    const stricter = `${SYSTEM}\n\nYour previous answer could not be used. Return only valid JSON matching the schema, with every required field filled.`;
    return parseExtraction(await generateJson(stricter, prompt, SCHEMA));
  }
}
