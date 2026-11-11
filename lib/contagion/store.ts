import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ContagionMap } from "@/types";
import { getPool, queryRows, SCHEMA_SQL, tigerEnabled } from "../tiger";

/** Writes one build: the tables for querying, and the whole map for the page. */
export async function saveContagion(map: ContagionMap): Promise<void> {
  const client = await getPool().connect();
  try {
    // A fresh database gets its tables first; every statement in the schema is idempotent.
    await client.query(SCHEMA_SQL);
    await client.query("BEGIN");
    // Each build replaces the last: a company dropped from the graph leaves with its links and events.
    await client.query("DELETE FROM sponsor_companies");
    for (const s of map.sponsors) {
      await client.query("INSERT INTO sponsors (id, name, aliases) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET name = $2, aliases = $3", [s.id, s.name, JSON.stringify(s.aliases)]);
    }
    for (const c of map.companies) {
      await client.query(
        "INSERT INTO sponsor_companies (cik, name, ticker, active, company_json, updated_at) VALUES ($1, $2, $3, $4, $5, NOW()) ON CONFLICT (cik) DO UPDATE SET name = $2, ticker = $3, active = $4, company_json = $5, updated_at = NOW()",
        [c.cik, c.name, c.ticker, c.active, JSON.stringify(c)],
      );
      for (const l of c.sponsors) {
        await client.query(
          "INSERT INTO sponsor_links (sponsor_id, cik, quote, document_url, filed) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (sponsor_id, cik) DO UPDATE SET quote = $3, document_url = $4, filed = $5",
          [l.sponsorId, c.cik, l.quote, l.documentUrl, l.filed || null],
        );
      }
      for (const e of c.events) {
        await client.query("INSERT INTO lme_events (id, cik, event_date, kind, term, quote, url) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING", [e.id, c.cik, e.date, e.kind, e.term, e.quote, e.url]);
      }
    }
    await client.query("DELETE FROM contagion_edges");
    for (const e of map.edges) await client.query("INSERT INTO contagion_edges (id, kind, source, target, label) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING", [e.id, e.kind, e.source, e.target, e.label]);
    await client.query("INSERT INTO contagion_builds (built_at, map_json) VALUES ($1, $2) ON CONFLICT (built_at) DO UPDATE SET map_json = $2", [map.builtAt, JSON.stringify(map)]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

let snapshot: ContagionMap | null = null;
let fromDb: { map: ContagionMap; at: number } | null = null;
/** Builds run offline a few times a week; a server instance rereads at most every ten minutes. */
const DB_TTL_MS = 10 * 60_000;

/** The newest build: from Tiger Data, or the snapshot the build script commits when the database is unreachable. */
export async function loadContagion(): Promise<ContagionMap | null> {
  if (fromDb && Date.now() - fromDb.at < DB_TTL_MS) return fromDb.map;
  if (tigerEnabled()) {
    const rows = await queryRows<{ map_json: ContagionMap }>("SELECT map_json FROM contagion_builds ORDER BY built_at DESC LIMIT 1").catch(() => []);
    if (rows[0]) {
      fromDb = { map: rows[0].map_json, at: Date.now() };
      return rows[0].map_json;
    }
  }
  if (!snapshot) {
    const raw = await readFile(path.join(process.cwd(), "data", "contagion.json"), "utf8").catch(() => null);
    snapshot = raw ? (JSON.parse(raw) as ContagionMap) : null;
  }
  return snapshot;
}
