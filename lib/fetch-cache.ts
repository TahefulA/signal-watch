import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** Serverless functions can only write to /tmp. */
const CACHE_DIR = process.env.VERCEL ? "/tmp/signal-watch-http" : path.join(process.cwd(), ".cache", "http");

interface ThrottleState {
  last: number;
}

const throttles = new Map<string, ThrottleState>();

async function throttle(key: string, minIntervalMs: number): Promise<void> {
  const state = throttles.get(key) ?? { last: 0 };
  throttles.set(key, state);
  const wait = state.last + minIntervalMs - Date.now();
  state.last = Math.max(Date.now(), state.last + minIntervalMs);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

export interface CachedFetchOptions {
  headers?: Record<string, string>;
  /** Minimum gap between requests sharing this throttle key. */
  throttleKey: string;
  minIntervalMs: number;
  /** Skip the disk cache, e.g. for feeds that change daily. */
  maxAgeMs?: number;
  /** Per-request timeout. */
  timeoutMs?: number;
}

/**
 * Fetches text over HTTP with a polite per-host throttle and an on-disk cache,
 * so re-running the ingestion pipeline does not re-download SEC documents.
 */
export async function cachedFetchText(
  url: string,
  options: CachedFetchOptions,
): Promise<string> {
  const key = createHash("sha1").update(url).digest("hex");
  const file = path.join(CACHE_DIR, `${key}.txt`);
  const metaFile = path.join(CACHE_DIR, `${key}.json`);

  try {
    const meta = JSON.parse(await readFile(metaFile, "utf8")) as { fetchedAt: number };
    const fresh = options.maxAgeMs === undefined || Date.now() - meta.fetchedAt < options.maxAgeMs;
    if (fresh) return await readFile(file, "utf8");
  } catch {
    // Cache miss, or a read-only file system.
  }

  const attempts = options.timeoutMs !== undefined ? 2 : 5;
  for (let attempt = 0; attempt < attempts; attempt++) {
    await throttle(options.throttleKey, options.minIntervalMs);
    let response: Response;
    try {
      response = await fetch(url, { headers: options.headers, signal: AbortSignal.timeout(options.timeoutMs ?? 30_000) });
    } catch {
      // Dropped connection or timeout: back off and retry.
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      continue;
    }
    if (response.ok) {
      const body = await response.text();
      try {
        await mkdir(CACHE_DIR, { recursive: true });
        await writeFile(file, body);
        await writeFile(metaFile, JSON.stringify({ url, fetchedAt: Date.now() }));
      } catch {
        // Caching is best-effort.
      }
      return body;
    }
    if (response.status === 404) throw new Error(`404 for ${url}`);
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  throw new Error(`Failed to fetch ${url}`);
}
