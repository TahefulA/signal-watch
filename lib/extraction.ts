import type { EntityType, MagnitudeKind, RelationDetail, RelationType, Severity, Trend } from "@/types";
import { ENTITY_TYPES, MAGNITUDE_KINDS, RELATION_DETAILS, RELATION_TYPES, SEVERITIES, TRENDS } from "@/types/entity";

const DETAILS = Object.keys(RELATION_DETAILS) as RelationDetail[];
import { type CorpusDoc, renderCorpus } from "./corpus";
import { GeminiError, type Schema, generateJson } from "./gemini";
import { EXTRACTION_SYSTEM as SYSTEM } from "./prompts/extraction";

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
    return parseExtraction(await generateJson(system, prompt, SCHEMA, { task: "extraction", thinking: "low" }));
  } catch (error) {
    if (!(error instanceof GeminiError) || error.kind !== "parse") throw error;
    const stricter = `${SYSTEM}\n\nYour previous answer could not be used. Return only valid JSON matching the schema, with every required field filled.`;
    return parseExtraction(await generateJson(stricter, prompt, SCHEMA, { task: "extraction", thinking: "low" }));
  }
}
