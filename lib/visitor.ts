import { createHash, randomUUID } from "node:crypto";
import { USER_KEY_HEADER } from "./gemini";
import { countUse, queryRows, tigerEnabled } from "./tiger";

/**
 * Visitors without accounts. A random id in a cookie keeps each visitor's
 * watchlist their own, and a hashed IP address counts the costly actions
 * (anything that calls Gemini) per day, so a public link cannot run up the
 * bill. A visitor who brings their own Gemini key pays for their own calls and
 * is not counted.
 */

export const VISITOR_COOKIE = "sw_vid";
const ID = /^[0-9a-f-]{36}$/;

export function readVisitor(request: Request): string | null {
  const raw = request.headers.get("cookie") ?? "";
  const m = raw.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([^;]+)`));
  return m && ID.test(m[1]) ? m[1] : null;
}

export function newVisitor(): { id: string; cookie: string } {
  const id = randomUUID();
  return { id, cookie: `${VISITOR_COOKIE}=${id}; Path=/; Max-Age=${60 * 60 * 24 * 400}; HttpOnly; SameSite=Lax; Secure` };
}

/** Free uses per visitor per day. A cached report never counts. */
export const DAILY_LIMIT = {
  analyze: 6,
  committee: 6,
  ask: 40,
  devil: 8,
  lme: 6,
  brief: 6,
  changes: 6,
  private: 4,
  compile: 20,
  radar: 12,
  feedback: 10,
  subscribe: 10,
} as const;
export type Bucket = keyof typeof DAILY_LIMIT;

function who(request: Request): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${process.env.CRON_SECRET ?? "signal-watch"}:${ip}`).digest("hex").slice(0, 32);
}

export function limitMessage(bucket: Bucket): string {
  return `You have used today's ${DAILY_LIMIT[bucket]} free ${bucket === "analyze" ? "fresh analyses" : "runs of this"}. Saved reports stay free to open. Come back tomorrow, or add your own Gemini key with the key button at the top.`;
}

/** What the site's own Gemini key may spend per UTC day, at list price, before new AI work pauses. DAILY_BUDGET_USD overrides it. */
export function dailyBudget(): number {
  const v = Number(process.env.DAILY_BUDGET_USD);
  return Number.isFinite(v) && v > 0 ? v : 10;
}

/** Today's spend on the site's key, from llm_calls; read at most once a minute per instance. */
let spend: { at: number; usd: number } | null = null;
export async function spentToday(): Promise<number> {
  if (spend && Date.now() - spend.at < 60_000) return spend.usd;
  const [row] = await queryRows<{ usd: number | null }>(
    "SELECT SUM(cost_usd)::float AS usd FROM llm_calls WHERE at >= date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AND NOT own_key",
  );
  spend = { at: Date.now(), usd: row?.usd ?? 0 };
  return spend.usd;
}

export const BUDGET_MESSAGE =
  "Signal Watch has used today's AI budget. Saved reports still open, and new analyses start again at midnight UTC. To run one now, add your own Gemini key with the key button at the top.";

/** Counts this use; returns the message to show when it goes over the day's limit or the site's daily budget, else null. Fails open if storage is down. */
export async function overLimit(request: Request, bucket: Bucket): Promise<string | null> {
  if (request.headers.get(USER_KEY_HEADER)?.trim()) return null;
  if (!tigerEnabled()) return null;
  try {
    // The whole site's spend first: a hard ceiling on the bill, whoever is asking, the crons included.
    if ((await spentToday()) >= dailyBudget()) return BUDGET_MESSAGE;
    const secret = process.env.CRON_SECRET;
    if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return null;
    const n = await countUse(who(request), bucket);
    return n > DAILY_LIMIT[bucket] ? limitMessage(bucket) : null;
  } catch (error) {
    console.error("Usage count failed", error);
    return null;
  }
}

/** The same check as a ready 429 response. */
export async function limited(request: Request, bucket: Bucket): Promise<Response | null> {
  const message = await overLimit(request, bucket);
  return message ? Response.json({ error: message, limited: true }, { status: 429 }) : null;
}
