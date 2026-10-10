import { Pool, type PoolConfig } from "pg";
import { TIMESCALE_CA } from "./certs/timescale-ca";
import type { Report } from "@/types";

/**
 * Tiger Data (PostgreSQL) storage for analysis reports. Each analyzed ticker
 * writes one report row and one row per entity on its map.
 */

let pool: Pool | null = null;

/** True when a connection string with credentials is configured. */
export function tigerEnabled(): boolean {
  const url = process.env.DATABASE_URL;
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
  const url = new URL(process.env.DATABASE_URL ?? "");
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
`;

export async function migrate(): Promise<void> {
  await getPool().query(SCHEMA_SQL);
}

export async function saveReport(report: Report): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO reports (id, ticker, generated_at, graph_json, memo_json, report_json, filings_analyzed, news_analyzed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        report.id,
        report.graph.company.ticker,
        report.generatedAt,
        JSON.stringify(report.graph),
        JSON.stringify(report.memo),
        JSON.stringify(report),
        report.filingsAnalyzed,
        report.newsAnalyzed,
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
     WHERE ticker = $1 AND generated_at > NOW() - make_interval(hours => $2)
     ORDER BY generated_at DESC LIMIT 1`,
    [ticker, maxAgeHours],
  );
  return result.rows[0]?.report_json ?? null;
}
