import { Pool, type PoolClient, type PoolConfig } from "pg";
import { TIMESCALE_CA } from "./certs/timescale-ca";
import { viewGraph } from "./graph-view";
import type { Entity, PeerComparison, Report } from "@/types";

/**
 * Tiger Data (PostgreSQL) storage for analysis reports. Each analyzed ticker
 * writes one report row and one row per entity on its map.
 */

let pool: Pool | null = null;

/** True when a connection string with credentials is configured. */
export function tigerEnabled(): boolean {
  const url = (process.env.TIGER_DATABASE_URL ?? process.env.DATABASE_URL);
  if (!url) return false;
  try {
    return new URL(url).password.length > 0;
  } catch {
    return false;
  }
}

/**
 * Tiger Cloud signs server certificates with its own CA, which Node does not
 * trust by default. Trust that CA explicitly so the connection stays verified.
 * The sslmode parameter is removed because pg would otherwise override this config.
 */
function connectionConfig(): PoolConfig {
  const url = new URL((process.env.TIGER_DATABASE_URL ?? process.env.DATABASE_URL) ?? "");
  const sslDisabled = url.searchParams.get("sslmode") === "disable";
  url.searchParams.delete("sslmode");
  const isTigerCloud = url.hostname.endsWith(".tsdb.cloud.timescale.com");
  const ssl: PoolConfig["ssl"] = sslDisabled
    ? false
    : isTigerCloud
      ? { ca: TIMESCALE_CA, rejectUnauthorized: true }
      : { rejectUnauthorized: true };
  return { connectionString: url.toString(), ssl };
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      ...connectionConfig(),
      max: 3,
      connectionTimeoutMillis: 5_000,
      query_timeout: 10_000,
    });
  }
  return pool;
}

export const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY,
  ticker text NOT NULL,
  generated_at timestamptz NOT NULL,
  graph_json jsonb NOT NULL,
  memo_json jsonb NOT NULL,
  report_json jsonb NOT NULL,
  filings_analyzed int NOT NULL,
  news_analyzed int NOT NULL
);
CREATE INDEX IF NOT EXISTS reports_ticker_time ON reports (ticker, generated_at DESC);

CREATE TABLE IF NOT EXISTS entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL,
  relationship text NOT NULL,
  severity text NOT NULL,
  source_quote text NOT NULL,
  source_url text NOT NULL,
  source_type text NOT NULL,
  source_date date
);
CREATE INDEX IF NOT EXISTS entities_report ON entities (report_id);

-- Baseline reports are built from filings available on as_of, for change detection.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS as_of date;

CREATE TABLE IF NOT EXISTS changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  baseline_report_id uuid REFERENCES reports (id) ON DELETE SET NULL,
  entity_name text NOT NULL,
  change_type text NOT NULL,
  old_value text,
  new_value text,
  detected_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS changes_report ON changes (report_id);

CREATE TABLE IF NOT EXISTS peer_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comparison_id uuid NOT NULL,
  report_id_1 uuid NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  report_id_2 uuid NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  shared_entities jsonb NOT NULL,
  unique_entities_1 jsonb NOT NULL,
  unique_entities_2 jsonb NOT NULL,
  comparison_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS peer_comparisons_report ON peer_comparisons (report_id_1);

-- Labeled property graph. entities is the node store (node_label + properties),
-- relationships is the edge store. The flat columns mirror common properties for querying.
ALTER TABLE entities ADD COLUMN IF NOT EXISTS entity_key text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS node_label text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS properties jsonb;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS revenue_impact numeric;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS cost_impact numeric;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS balance_sheet_impact numeric;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS magnitude_label text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS trend text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS why_it_matters text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS what_if_disappeared text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS structural_protection text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS source_page text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS source_section text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT NOW();
CREATE INDEX IF NOT EXISTS entities_label ON entities (node_label);

CREATE TABLE IF NOT EXISTS relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  from_node_id uuid NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
  to_node_id uuid NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
  relationship_type text NOT NULL,
  properties jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS relationships_report ON relationships (report_id);
CREATE INDEX IF NOT EXISTS relationships_type ON relationships (relationship_type);

CREATE TABLE IF NOT EXISTS debt_instruments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  instrument_name text NOT NULL,
  face_value numeric,
  commitment numeric,
  maturity_date text,
  coupon text,
  seniority text NOT NULL,
  kind text NOT NULL,
  source_quote text NOT NULL,
  source_url text NOT NULL
);
CREATE INDEX IF NOT EXISTS debt_instruments_report ON debt_instruments (report_id);

ALTER TABLE entities ADD COLUMN IF NOT EXISTS relation_detail text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS confidence text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS headline text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS fiscal_period text;
ALTER TABLE relationships ADD COLUMN IF NOT EXISTS relationship_detail text;

-- Citation validation and entity resolution, one row per decision.
CREATE TABLE IF NOT EXISTS rejected_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  name text NOT NULL,
  reason text NOT NULL,
  proposed_quote text
);
CREATE TABLE IF NOT EXISTS entity_merges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  kept_name text NOT NULL,
  merged_name text NOT NULL,
  reason text NOT NULL
);
CREATE TABLE IF NOT EXISTS financial_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  metric_key text NOT NULL,
  label text NOT NULL,
  display text NOT NULL,
  note text NOT NULL,
  fiscal_period text,
  as_of date
);
CREATE INDEX IF NOT EXISTS financial_snapshots_report ON financial_snapshots (report_id);

CREATE TABLE IF NOT EXISTS watchlist (
  ticker text PRIMARY KEY,
  added_at timestamptz NOT NULL DEFAULT NOW()
);
`;

export async function migrate(): Promise<void> {
  await getPool().query(SCHEMA_SQL);
}

const NODE_LABEL: Record<Entity["type"], string> = {
  company: "Company",
  risk: "Risk",
  macro: "Macro",
  financial: "Financial",
  regulatory: "Regulatory",
  neutral: "Neutral",
};

/** A percentage or dollar figure from a magnitude label, e.g. "41% of revenue" -> 41. */
function numberIn(label: string): number | null {
  const match = label.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  if (/billion/i.test(label)) return value * 1e9;
  if (/million/i.test(label)) return value * 1e6;
  return value;
}

function relationshipType(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/(^_|_$)/g, "").slice(0, 60) || "RELATED_TO";
}

/** Writes the report's graph as nodes and edges, plus its debt instruments. */
export async function writeGraph(client: PoolClient, report: Report): Promise<void> {
  const uuidOf = new Map<string, string>();
  for (const e of report.graph.nodes) {
    if (e.change?.kind === "removed") continue;
    const m = e.magnitude ?? null;
    const result = await client.query<{ id: string }>(
      `INSERT INTO entities (report_id, entity_key, node_label, name, type, relationship, severity, source_quote, source_url,
         source_type, source_date, properties, revenue_impact, cost_impact, balance_sheet_impact, magnitude_label, trend,
         why_it_matters, what_if_disappeared, structural_protection, source_page, source_section,
         relation_detail, confidence, headline, fiscal_period)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
       RETURNING id`,
      [
        report.id,
        e.id,
        NODE_LABEL[e.type],
        e.name,
        e.type,
        e.relationship,
        e.severity,
        e.sourceQuote,
        e.sourceUrl,
        e.sourceType,
        e.sourceDate || null,
        JSON.stringify(e),
        m?.kind === "revenue" ? numberIn(m.label) : null,
        m?.kind === "cost" ? numberIn(m.label) : null,
        m?.kind === "balance_sheet" ? numberIn(m.label) : null,
        m?.label ?? null,
        e.trend ?? null,
        e.strategic?.whyItMatters ?? null,
        e.strategic?.ifItDisappeared ?? null,
        e.strategic?.protection?.text ?? null,
        e.sourcePage ?? null,
        e.sourceLabel,
        e.relationDetail ?? null,
        e.confidence ?? null,
        e.headline ?? null,
        e.fiscalPeriod ?? null,
      ],
    );
    uuidOf.set(e.id, result.rows[0].id);
  }

  const central = report.graph.nodes.find((n) => n.isCentral);
  // Every entity gets its typed edge to the company (the map's spokes), plus any entity-to-entity links.
  const { spokes } = viewGraph(report.graph);
  const links = report.graph.edges.filter((e) => !central || (e.source !== central.id && e.target !== central.id));
  for (const edge of [...spokes, ...links]) {
    const target = report.graph.nodes.find((n) => n.id === edge.target);
    // Edges from the subject company are stored entity -> company with the typed relationship, e.g. Fluidstack CUSTOMER_OF TeraWulf.
    const fromCompany = central && edge.source === central.id;
    const from = uuidOf.get(fromCompany ? edge.target : edge.source);
    const to = uuidOf.get(fromCompany ? edge.source : edge.target);
    if (!from || !to) continue;
    const type = fromCompany ? (target?.relationType ?? "IMPACTS") : relationshipType(edge.relationship);
    await client.query(
      "INSERT INTO relationships (report_id, from_node_id, to_node_id, relationship_type, relationship_detail, properties) VALUES ($1, $2, $3, $4, $5, $6)",
      [report.id, from, to, type, fromCompany ? (target?.relationDetail ?? null) : null, JSON.stringify({ label: edge.relationship })],
    );
  }

  for (const r of report.validation?.rejected ?? []) {
    await client.query("INSERT INTO rejected_entities (report_id, name, reason, proposed_quote) VALUES ($1, $2, $3, $4)", [
      report.id,
      r.name,
      r.reason,
      r.quote,
    ]);
  }
  for (const m of report.validation?.merges ?? []) {
    await client.query("INSERT INTO entity_merges (report_id, kept_name, merged_name, reason) VALUES ($1, $2, $3, $4)", [
      report.id,
      m.kept,
      m.merged,
      m.reason,
    ]);
  }
  for (const m of report.capital?.metrics ?? []) {
    await client.query(
      "INSERT INTO financial_snapshots (report_id, metric_key, label, display, note, fiscal_period, as_of) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [report.id, m.key, m.label, m.display, m.note, report.capital?.fiscalPeriod ?? null, report.capital?.asOf ?? null],
    );
  }

  for (const i of report.capital?.instruments ?? []) {
    await client.query(
      `INSERT INTO debt_instruments (report_id, instrument_name, face_value, commitment, maturity_date, coupon, seniority, kind, source_quote, source_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [report.id, i.name, i.outstanding, i.commitment, i.maturity, i.coupon, i.seniority, i.kind, i.citations[0]?.quote ?? "", i.citations[0]?.sourceUrl ?? ""],
    );
  }
}

export async function saveReport(report: Report): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO reports (id, ticker, generated_at, graph_json, memo_json, report_json, filings_analyzed, news_analyzed, as_of)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        report.id,
        report.graph.company.ticker,
        report.generatedAt,
        JSON.stringify(report.graph),
        JSON.stringify(report.memo),
        JSON.stringify(report),
        report.filingsAnalyzed,
        report.newsAnalyzed,
        report.asOf ?? null,
      ],
    );
    await writeGraph(client, report);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Most recent report for a ticker generated within the given window. */
export async function findRecentReport(ticker: string, maxAgeHours: number): Promise<Report | null> {
  const result = await getPool().query<{ report_json: Report }>(
    `SELECT report_json FROM reports
     WHERE ticker = $1 AND as_of IS NULL AND generated_at > NOW() - make_interval(hours => $2)
     ORDER BY generated_at DESC LIMIT 1`,
    [ticker, maxAgeHours],
  );
  return result.rows[0]?.report_json ?? null;
}

/** A specific saved report, regardless of age. */
export async function findReportById(id: string): Promise<Report | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const result = await getPool().query<{ report_json: Report }>("SELECT report_json FROM reports WHERE id = $1", [id]);
  return result.rows[0]?.report_json ?? null;
}

/** A baseline report for a ticker built from the filings available on a date. */
export async function findBaseline(ticker: string, asOf: string, pipelineVersion: number): Promise<Report | null> {
  const result = await getPool().query<{ report_json: Report }>(
    `SELECT report_json FROM reports
     WHERE ticker = $1 AND as_of = $2 AND (report_json->>'pipelineVersion')::int = $3
     ORDER BY generated_at DESC LIMIT 1`,
    [ticker, asOf, pipelineVersion],
  );
  return result.rows[0]?.report_json ?? null;
}

/** Stores the comparison on the report and one row per change. */
export async function saveChanges(report: Report): Promise<void> {
  const changes = report.changes;
  if (!changes) return;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE reports SET report_json = $2, graph_json = $3 WHERE id = $1", [
      report.id,
      JSON.stringify(report),
      JSON.stringify(report.graph),
    ]);
    await client.query("DELETE FROM changes WHERE report_id = $1", [report.id]);
    for (const c of changes.changes) {
      await client.query(
        `INSERT INTO changes (report_id, baseline_report_id, entity_name, change_type, old_value, new_value)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [report.id, changes.baselineId, c.name, c.kind, c.before ?? null, c.after ?? null],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Stores a comparison as one row per subject-peer pair. */
export async function savePeerComparison(comparison: PeerComparison): Promise<void> {
  const [subject, ...peers] = comparison.companies;
  if (!subject) return;
  for (const peer of peers) {
    const shared = comparison.shared.filter((s) => s.members.some((m) => m.ticker === peer.ticker));
    await getPool().query(
      `INSERT INTO peer_comparisons (comparison_id, report_id_1, report_id_2, shared_entities, unique_entities_1, unique_entities_2, comparison_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        comparison.id,
        subject.reportId,
        peer.reportId,
        JSON.stringify(shared),
        JSON.stringify(comparison.unique[subject.ticker] ?? []),
        JSON.stringify(comparison.unique[peer.ticker] ?? []),
        JSON.stringify(comparison),
      ],
    );
  }
}

/** Replaces a saved report's JSON, e.g. after a brief is added. */
export async function updateReport(report: Report): Promise<void> {
  await getPool().query("UPDATE reports SET report_json = $2, graph_json = $3 WHERE id = $1", [
    report.id,
    JSON.stringify(report),
    JSON.stringify(report.graph),
  ]);
}

/** Rewrites the graph tables for a saved report, for reports saved before those tables existed. */
export async function backfillGraph(report: Report): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM relationships WHERE report_id = $1", [report.id]);
    await client.query("DELETE FROM entities WHERE report_id = $1", [report.id]);
    await client.query("DELETE FROM debt_instruments WHERE report_id = $1", [report.id]);
    await client.query("DELETE FROM rejected_entities WHERE report_id = $1", [report.id]);
    await client.query("DELETE FROM entity_merges WHERE report_id = $1", [report.id]);
    await client.query("DELETE FROM financial_snapshots WHERE report_id = $1", [report.id]);
    await writeGraph(client, report);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Every saved report id, oldest first. */
export async function listReportIds(): Promise<string[]> {
  const result = await getPool().query<{ id: string }>("SELECT id FROM reports ORDER BY generated_at");
  return result.rows.map((r) => r.id);
}

/** Runs a read-only query against the graph tables, for scripts. */
export async function queryRows<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await getPool().query<T>(sql, params);
  return result.rows;
}

export async function listWatchlist(): Promise<string[]> {
  const rows = await queryRows<{ ticker: string }>("SELECT ticker FROM watchlist ORDER BY added_at");
  return rows.map((r) => r.ticker);
}

export async function addToWatchlist(ticker: string): Promise<void> {
  await getPool().query("INSERT INTO watchlist (ticker) VALUES ($1) ON CONFLICT DO NOTHING", [ticker]);
}

export async function removeFromWatchlist(ticker: string): Promise<void> {
  await getPool().query("DELETE FROM watchlist WHERE ticker = $1", [ticker]);
}

/** The newest current (non-baseline) report for a ticker, at any age. */
export async function findLatestReport(ticker: string): Promise<Report | null> {
  const rows = await queryRows<{ report_json: Report }>(
    "SELECT report_json FROM reports WHERE ticker = $1 AND as_of IS NULL ORDER BY generated_at DESC LIMIT 1",
    [ticker],
  );
  return rows[0]?.report_json ?? null;
}
