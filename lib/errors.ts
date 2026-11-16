import { createHash } from "node:crypto";
import { getPool, tigerEnabled } from "./tiger";

/**
 * A small error tracker: server errors and browser crashes land in app_errors,
 * grouped by a fingerprint of where they came from and their first line, and
 * /ops lists the groups. Recording never throws, and at most MAX_PER_MINUTE
 * rows are written per instance so an error loop cannot flood the table.
 */

const MAX_PER_MINUTE = 30;
let minute = { start: 0, n: 0 };

export interface ErrorRecord {
  source: "server" | "client";
  /** The API route, or the page path for a browser error. */
  where: string;
  message: string;
  stack?: string | null;
  traceId?: string | null;
  status?: number | null;
}

/** Turns anything thrown or logged into one readable line and a stack. */
export function describe(args: unknown[]): { message: string; stack: string | null } {
  const err = args.find((a): a is Error => a instanceof Error);
  const text = args
    .map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === "string" ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })()))
    .join(" ");
  return { message: text.slice(0, 1000), stack: err?.stack?.slice(0, 4000) ?? null };
}

/** Numbers, ids and quoted values are masked so the same failure on different tickers is one group. */
export function fingerprint(source: string, where: string, message: string): string {
  const norm = message
    .split("\n")[0]
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "<id>")
    .replace(/\b[A-Z]{1,5}\b/g, "<T>")
    .replace(/\d+(\.\d+)?/g, "<n>")
    .replace(/"[^"]*"/g, '"…"')
    .slice(0, 200);
  return createHash("sha1").update(`${source}|${where}|${norm}`).digest("hex").slice(0, 16);
}

export async function recordError(e: ErrorRecord): Promise<void> {
  if (!tigerEnabled() || process.env.ERROR_LOG === "off") return;
  const now = Date.now();
  if (now - minute.start > 60_000) minute = { start: now, n: 0 };
  if (++minute.n > MAX_PER_MINUTE) return;
  try {
    await getPool().query(
      "INSERT INTO app_errors (source, where_at, message, stack, fingerprint, trace_id, status) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [e.source, e.where.slice(0, 200), e.message.slice(0, 1000), e.stack ?? null, fingerprint(e.source, e.where, e.message), e.traceId ?? null, e.status ?? null],
    );
  } catch {
    // The tracker must never become the error.
  }
}
