import type { EntityType, MagnitudeKind, RelationDetail, RelationType, Severity, Trend } from "@/types";
import { ENTITY_TYPES, MAGNITUDE_KINDS, RELATION_DETAILS, RELATION_TYPES, SEVERITIES, TRENDS } from "@/types/entity";

const DETAILS = Object.keys(RELATION_DETAILS) as RelationDetail[];
import { type CorpusDoc, renderCorpus } from "./corpus";
import { GeminiError, type Schema, generateJson } from "./gemini";

export interface RawEntity {
  name: string;
  type: EntityType;
  relation_type: RelationType;
  relation_detail: RelationDetail | null;
  explicitness: "explicit" | "inferred";
  headline: string | null;
  parent_name: string | null;
  parent_quote: string | null;
  parent_doc: string | null;
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

export interface RawRating {
  agency: string;
  rating: string;
  outlook: string | null;
  subject: string | null;
  quote: string;
  doc: string;
}

export interface Extraction {
  subject_quote: string;
  subject_doc: string;
  industry_phrase: string | null;
  ratings: RawRating[];
  nodes: RawEntity[];
  edges: RawEdge[];
}

const SYSTEM = `You are a credit analyst's research assistant. You read SEC filings and news articles and extract structured information for a knowledge graph.

Extract the entities connected to the main company that matter to its credit. Return between 18 and 25 entities, most material first, covering these categories where the text supports them:
1. Direct counterparties: customers, tenants, suppliers, utilities, partners (aim for at least 5).
2. Named competitors (aim for at least 3). Only companies the text names as competitors.
3. Regulators or specific regulations, orders and permits (at least 2).
4. Macro factors such as interest rates, power prices, tariffs, commodity prices, FX (at least 2).
5. Debt instruments and facilities, each tranche separately (at least 3 if the company has them).
6. Specific internal risks: concentration, execution, legal, liquidity (at least 2).
7. Named executives, directors or large shareholders (at least 1).
If the text does not support a category, return what it supports. Never pad with entities the text does not mention, and never repeat an entity under two names.

Rules:
- Only use what the provided text states. Never add knowledge from outside the text.
- Every *_quote field must be copied exactly from the text, character for character, one sentence or less, at most 250 characters. Every *_doc field is the bracketed id of the block that quote came from, such as D3.
- name is short (1 to 6 words). relationship is 2 to 5 words, written from the main company's point of view, for example "HPC tenant", "Secured by", "Competes with", "Regulated by", "Exposed to".
- Risk names must be specific to this company, never a generic category. Bad: "Construction Risk", "Regulatory Risk", "Market Risk". Good: "Lake Mariner Buildout Delay", "NY Executive Order No. 62 Permit Pause", "Kentucky PSC Approval of Muskie Phase 2". The quote must describe that specific risk.
- relation_type is the general relationship from the entity to the main company: CUSTOMER_OF (buys from or leases from the company), SUPPLIES_TO (sells power, equipment, land or services to it, including utilities), LENDS_TO (lenders, notes, credit facilities), GUARANTEES (guarantees or credit support), REGULATES, COMPETES_WITH, OWNED_BY (subsidiaries, joint ventures, sites the company owns), PARTNERS_WITH, AFFILIATED_WITH (executives, directors, holders), IMPACTS (risks and macro factors).
- relation_detail is the specific relationship. Use a qualified label only when the quote uses that word: SOLE_SUPPLIER_OF (sole, only, exclusive), PRIMARY_SUPPLIER_OF (primary, principal), ANCHOR_TENANT_OF (anchor), MAJOR_CUSTOMER_OF (major, significant, largest, concentration), GUARANTEES (guarantee), PROVIDES_CREDIT_SUPPORT_TO (credit support, backstop). Otherwise use the plain label: SUPPLIES_TO, CUSTOMER_OF, LENDS_TO, HAS_CREDIT_FACILITY_WITH, DIRECT_COMPETITOR_OF, COMPETES_WITH, REGULATED_BY, SUBJECT_TO_ORDER_FROM, LICENSED_BY, OWNS, JOINT_VENTURE_WITH, PARTNERS_WITH, EXECUTIVE_OF, DIRECTOR_OF, MAJOR_HOLDER_OF, EXPOSED_TO, DEPENDENT_ON, SENSITIVE_TO.
- type: company for other businesses, financial for debt, equity, liquidity and capital items, risk for risks, macro for economy-wide factors and policy, regulatory for regulators and rules, neutral for sites, people and anything else.
- severity reflects how material the entity is to the company's credit: high, medium, low, or none.
- explicitness: "explicit" when the quote directly states the entity's relationship to the company, "inferred" when you derived the relationship from context.

Context for each entity. Leave a field null when the text does not support it; never estimate or compute a number.
- headline: at most 9 words for the box, the most decision-relevant fact, for example "Credit support behind Fluidstack lease payments". Use a number only if it is in the entity's quotes.
- magnitude_label: the single most useful disclosed figure for this entity, at most 6 words, using the number exactly as the text writes it, for example "$3,200.0 million principal", "378 MW contracted", "41% of revenue". For customers and tenants, prefer a share of revenue when the text gives one. magnitude_kind says what it measures. magnitude_quote is the sentence containing that figure.
- trend: increasing, decreasing or stable only when the text compares this entity's figure across periods; otherwise unknown. trend_quote is the sentence making that comparison.
- why_it_matters: one sentence on why this entity matters to the company's credit. Do not include numbers.
- downside_scenario: one sentence on the harm to the company in the bad case. For counterparties, financing, sites and people: the relationship ends or fails. For risks, macro factors, regulators and rules: the risk materializes, or the regulator or rule acts against the company. Always describe the harm, never a benefit. Do not include numbers.
- In headline, why_it_matters and downside_scenario, never rank or compare entities (largest, sole, only, main, biggest, primary, majority) unless a quote you return says so in those words.
- protection: a contract term, guarantee, collateral, insurance or similar protection the text describes for this relationship, at most 12 words. protection_quote is the sentence describing it.
- parent_name: the entity's parent or controlling company only if the text states it; parent_quote is that sentence.

- edges: use "COMPANY" for the main company. Add an edge between two entities only when the text links them directly (for example a credit support provider behind a tenant's lease).
- subject_quote is one sentence from the text that describes what the main company does. industry_phrase is the shortest phrase inside subject_quote, at most 8 words, that names the company's business, for example "owner and operator of digital infrastructure".
- ratings: any credit ratings the text states for the company or its debt (agency, rating, outlook, what was rated), each with its quote. Empty if none.`;

const nullableString: Schema = { type: "STRING", nullable: true };

const SCHEMA: Schema = {
  type: "OBJECT",
  properties: {
    subject_quote: { type: "STRING" },
    subject_doc: { type: "STRING" },
    industry_phrase: nullableString,
    ratings: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          agency: { type: "STRING" },
          rating: { type: "STRING" },
          outlook: nullableString,
          subject: nullableString,
          quote: { type: "STRING" },
          doc: { type: "STRING" },
        },
        required: ["agency", "rating", "quote", "doc"],
      },
    },
    nodes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          type: { type: "STRING", enum: ENTITY_TYPES },
          relation_type: { type: "STRING", enum: RELATION_TYPES },
          relation_detail: { type: "STRING", enum: DETAILS },
          explicitness: { type: "STRING", enum: ["explicit", "inferred"] },
          headline: nullableString,
          parent_name: nullableString,
          parent_quote: nullableString,
          parent_doc: nullableString,
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
          downside_scenario: nullableString,
          protection: nullableString,
          protection_quote: nullableString,
          protection_doc: nullableString,
        },
        required: ["name", "type", "relation_type", "relation_detail", "explicitness", "relationship", "severity", "source_quote", "source_doc", "trend"],
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
    relation_detail: oneOf(r.relation_detail, DETAILS),
    explicitness: r.explicitness === "explicit" ? "explicit" : "inferred",
    headline: optionalString(r.headline),
    parent_name: optionalString(r.parent_name),
    parent_quote: optionalString(r.parent_quote),
    parent_doc: optionalString(r.parent_doc),
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
    if_it_disappeared: optionalString(r.downside_scenario),
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
  // A handful of entities means a truncated or degenerate answer, not a sparse filing.
  if (nodes.length < 4) throw new GeminiError(`Extraction returned only ${nodes.length} usable entities`, "parse");
  const ratings = (Array.isArray(v.ratings) ? v.ratings : []).filter((x): x is RawRating => {
    if (typeof x !== "object" || x === null) return false;
    const r = x as Record<string, unknown>;
    return isString(r.agency) && isString(r.rating) && isString(r.quote) && isString(r.doc);
  });
  return {
    subject_quote: isString(v.subject_quote) ? v.subject_quote : "",
    subject_doc: isString(v.subject_doc) ? v.subject_doc : "",
    industry_phrase: optionalString(v.industry_phrase),
    ratings: ratings.map((x) => ({ ...x, outlook: optionalString(x.outlook), subject: optionalString(x.subject) })),
    nodes,
    edges,
  };
}

/** Extracts entities, their context and relationships from the corpus. Retries once with a stricter prompt on bad output. */
export async function extractEntities(
  companyName: string,
  ticker: string,
  docs: CorpusDoc[],
  options: { strict?: boolean } = {},
): Promise<Extraction> {
  const prompt = `Main company: ${companyName} (${ticker}).\n\n${renderCorpus(docs)}`;
  const system = options.strict
    ? `${SYSTEM}\n\nA previous attempt had too many quotes that could not be found in the text. Copy every quote character for character from a single block, and cite that block's id.`
    : SYSTEM;
  try {
    return parseExtraction(await generateJson(system, prompt, SCHEMA, { thinking: "low" }));
  } catch (error) {
    if (!(error instanceof GeminiError) || error.kind !== "parse") throw error;
    const stricter = `${SYSTEM}\n\nYour previous answer could not be used. Return only valid JSON matching the schema, with every required field filled.`;
    return parseExtraction(await generateJson(stricter, prompt, SCHEMA, { thinking: "low" }));
  }
}
