import { Pool, type PoolClient, type PoolConfig } from "pg";
import { TIMESCALE_CA } from "./certs/timescale-ca";
import type { ComponentKey, SignalEvent, SignalScore, TickerDataset, TickerProfile } from "@/types";

/**
 * Tiger Data (PostgreSQL + TimescaleDB) storage. signal_scores is a hypertable
 * keyed by ticker and time; events and tickers are plain relational tables.
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
CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS tickers (
  ticker text PRIMARY KEY,
  name text NOT NULL,
  cik text NOT NULL,
  sector text NOT NULL,
  sector_etf text NOT NULL,
  reason text NOT NULL,
  generated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS signal_scores (
  ticker text NOT NULL,
  timestamp timestamptz NOT NULL,
  total_score numeric NOT NULL,
  filing_anomaly numeric NOT NULL,
  insider_activity numeric NOT NULL,
  sentiment_divergence numeric NOT NULL,
  market_divergence numeric NOT NULL,
  drivers jsonb NOT NULL,
  notes jsonb NOT NULL,
  PRIMARY KEY (ticker, timestamp)
);
SELECT create_hypertable('signal_scores', 'timestamp', if_not_exists => TRUE);

CREATE TABLE IF NOT EXISTS events (
  id text PRIMARY KEY,
  ticker text NOT NULL,
  timestamp timestamptz NOT NULL,
  event_type text NOT NULL,
  category text NOT NULL,
  component text NOT NULL,
  title text NOT NULL,
  quote text NOT NULL,
  quote_kind text NOT NULL,
  source_label text NOT NULL,
  source_url text NOT NULL,
  score_impact numeric NOT NULL
);
CREATE INDEX IF NOT EXISTS events_ticker_time ON events (ticker, timestamp DESC);

CREATE TABLE IF NOT EXISTS watchlist (
  ticker text PRIMARY KEY,
  added_at timestamptz NOT NULL DEFAULT now()
);
`;

export async function migrate(): Promise<void> {
  await getPool().query(SCHEMA_SQL);
}

async function inTransaction(work: (client: PoolClient) => Promise<void>): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await work(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function saveDataset(dataset: TickerDataset): Promise<void> {
  const { profile } = dataset;
  await inTransaction(async (client) => {
    await client.query(
      `INSERT INTO tickers (ticker, name, cik, sector, sector_etf, reason, generated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (ticker) DO UPDATE SET name = $2, cik = $3, sector = $4, sector_etf = $5, reason = $6, generated_at = $7`,
      [profile.ticker, profile.name, profile.cik, profile.sector, profile.sector_etf, dataset.reason, dataset.generated_at],
    );
    await client.query("INSERT INTO watchlist (ticker) VALUES ($1) ON CONFLICT DO NOTHING", [profile.ticker]);
    await client.query("DELETE FROM signal_scores WHERE ticker = $1", [profile.ticker]);
    await client.query("DELETE FROM events WHERE ticker = $1", [profile.ticker]);
    for (const s of dataset.scores) {
      await client.query(
        `INSERT INTO signal_scores (ticker, timestamp, total_score, filing_anomaly, insider_activity,
           sentiment_divergence, market_divergence, drivers, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [s.ticker, s.date, s.total_score, s.filing_anomaly, s.insider_activity, s.sentiment_divergence,
          s.market_divergence, JSON.stringify(s.drivers), JSON.stringify(s.notes)],
      );
    }
    for (const e of dataset.events) {
      await client.query(
        `INSERT INTO events (id, ticker, timestamp, event_type, category, component, title, quote, quote_kind,
           source_label, source_url, score_impact)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO NOTHING`,
        [e.id, e.ticker, e.date, e.event_type, e.category, e.component, e.title, e.quote, e.quote_kind,
          e.source_label, e.source_url, e.score_impact],
      );
    }
  });
}

interface ScoreRow {
  ticker: string;
  date: string;
  total_score: string;
  filing_anomaly: string;
  insider_activity: string;
  sentiment_divergence: string;
  market_divergence: string;
  drivers: Record<ComponentKey, string[]>;
  notes: Record<ComponentKey, string>;
}

interface EventRow extends Omit<SignalEvent, "score_impact"> {
  score_impact: string;
}

interface TickerRow extends TickerProfile {
  reason: string;
  generated_at: Date;
}

function toScore(row: ScoreRow): SignalScore {
  return {
    ticker: row.ticker,
    date: row.date,
    total_score: Number(row.total_score),
    filing_anomaly: Number(row.filing_anomaly),
    insider_activity: Number(row.insider_activity),
    sentiment_divergence: Number(row.sentiment_divergence),
    market_divergence: Number(row.market_divergence),
    drivers: row.drivers,
    notes: row.notes,
  };
}

export async function listTickers(): Promise<string[]> {
  const result = await getPool().query<{ ticker: string }>("SELECT ticker FROM watchlist ORDER BY added_at");
  return result.rows.map((r) => r.ticker);
}

export async function loadDataset(ticker: string): Promise<TickerDataset | null> {
  const db = getPool();
  const profile = await db.query<TickerRow>("SELECT * FROM tickers WHERE ticker = $1", [ticker]);
  if (profile.rowCount === 0) return null;
  const scores = await db.query<ScoreRow>(
    `SELECT ticker, to_char(timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date, total_score, filing_anomaly,
       insider_activity, sentiment_divergence, market_divergence, drivers, notes
     FROM signal_scores WHERE ticker = $1 AND timestamp > NOW() - INTERVAL '90 days' ORDER BY timestamp ASC`,
    [ticker],
  );
  const events = await db.query<EventRow>(
    `SELECT id, ticker, to_char(timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date, event_type, category, component,
       title, quote, quote_kind, source_label, source_url, score_impact
     FROM events WHERE ticker = $1 ORDER BY timestamp ASC`,
    [ticker],
  );
  const row = profile.rows[0];
  return {
    profile: { ticker: row.ticker, name: row.name, cik: row.cik, sector: row.sector, sector_etf: row.sector_etf },
    scores: scores.rows.map(toScore),
    events: events.rows.map((e) => ({ ...e, score_impact: Number(e.score_impact) })),
    reason: row.reason,
    generated_at: row.generated_at.toISOString(),
  };
}
