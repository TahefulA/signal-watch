import { Pool, type PoolConfig } from "pg";
import { TIMESCALE_CA } from "./certs/timescale-ca";
import type { PeerComparison, Report } from "@/types";

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
`;

export async function migrate(): Promise<void> {
  await getPool().query(SCHEMA_SQL);
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
    for (const e of report.graph.nodes) {
      if (e.isCentral) continue;
      await client.query(
        `INSERT INTO entities (report_id, name, type, relationship, severity, source_quote, source_url, source_type, source_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [report.id, e.name, e.type, e.relationship, e.severity, e.sourceQuote, e.sourceUrl, e.sourceType, e.sourceDate || null],
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
export async function findBaseline(ticker: string, asOf: string): Promise<Report | null> {
  const result = await getPool().query<{ report_json: Report }>(
    "SELECT report_json FROM reports WHERE ticker = $1 AND as_of = $2 ORDER BY generated_at DESC LIMIT 1",
    [ticker, asOf],
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
