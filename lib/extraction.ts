import type { EntityType, Severity } from "@/types";
import { ENTITY_TYPES, SEVERITIES } from "@/types/entity";
import { type CorpusDoc, renderCorpus } from "./corpus";
import { GeminiError, type Schema, generateJson } from "./gemini";

export interface RawEntity {
  name: string;
  type: EntityType;
  relationship: string;
  severity: Severity;
  source_quote: string;
  source_doc: string;
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
- source_quote must be copied exactly from the text, character for character, one sentence or less, at most 200 characters.
- source_doc is the bracketed id of the block the quote came from, such as D3.
- name is short (1 to 5 words). relationship is 2 to 5 words, written from the main company's point of view, for example "HPC tenant", "Secured by", "Competes with", "Regulated by", "Exposed to".
- type: company for other businesses, financial for debt, equity, liquidity and capital items, risk for risks, macro for economy-wide factors and policy, regulatory for regulators and rules, neutral for sites, people and anything else.
- severity reflects how material the entity is to the company's credit: high, medium, low, or none.
- edges: use "COMPANY" for the main company. Add an edge between two entities only when the text links them directly (for example a guarantor behind a tenant's lease).
- Return 10 to 20 entities, most material first. Return fewer if the text supports fewer. Do not repeat an entity.
- subject_quote is one sentence from the text that describes what the main company does.`;

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
          relationship: { type: "STRING" },
          severity: { type: "STRING", enum: SEVERITIES },
          source_quote: { type: "STRING" },
          source_doc: { type: "STRING" },
        },
        required: ["name", "type", "relationship", "severity", "source_quote", "source_doc"],
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

function parseExtraction(value: unknown): Extraction {
  if (typeof value !== "object" || value === null) throw new GeminiError("Extraction is not an object", "parse");
  const v = value as Record<string, unknown>;
  const nodes = (Array.isArray(v.nodes) ? v.nodes : []).filter((n): n is RawEntity => {
    if (typeof n !== "object" || n === null) return false;
    const r = n as Record<string, unknown>;
    return (
      isString(r.name) &&
      ENTITY_TYPES.includes(r.type as EntityType) &&
      isString(r.relationship) &&
      SEVERITIES.includes(r.severity as Severity) &&
      isString(r.source_quote) &&
      isString(r.source_doc)
    );
  });
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

/** Extracts entities and relationships from the corpus. Retries once with a stricter prompt on bad output. */
export async function extractEntities(companyName: string, ticker: string, docs: CorpusDoc[]): Promise<Extraction> {
  const prompt = `Main company: ${companyName} (${ticker}).\n\n${renderCorpus(docs)}`;
  try {
    return parseExtraction(await generateJson(SYSTEM, prompt, SCHEMA, { thinking: "low" }));
  } catch (error) {
    if (!(error instanceof GeminiError) || error.kind !== "parse") throw error;
    const stricter = `${SYSTEM}\n\nYour previous answer could not be used. Return only valid JSON matching the schema, with every field filled.`;
    return parseExtraction(await generateJson(stricter, prompt, SCHEMA));
  }
}
