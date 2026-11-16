import { createHash } from "node:crypto";
import { currentUser } from "./auth";
import { getPool, tigerEnabled } from "./tiger";
import { readVisitor } from "./visitor";

/**
 * Anonymous product events for the funnel on /ops: who came, who opened a
 * report, who watched a company, who came back. The actor is a salted hash of
 * the account, visitor cookie or (failing both) IP and browser, so no raw id
 * or address is stored. Bots are dropped, and a browser that opened any page
 * with ?internal=1 (the owner's) sends nothing.
 */

export const EVENTS = ["page_view", "report_view", "analysis_run", "watch_add", "share", "sign_in", "alerts_on", "alert_signup"] as const;
export type EventName = (typeof EVENTS)[number];

const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|vercel-|curl|wget|python|node-fetch|go-http/i;

export function isBot(request: Request): boolean {
  return BOT.test(request.headers.get("user-agent") ?? "") || request.headers.get("x-sw-internal") === "1";
}

async function actor(request: Request): Promise<string> {
  const user = await currentUser(request).catch(() => null);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const raw = user ? `u:${user.id}` : (readVisitor(request) ?? `ip:${ip}|${request.headers.get("user-agent") ?? ""}`);
  return createHash("sha256").update(`${process.env.CRON_SECRET ?? "signal-watch"}:${raw}`).digest("hex").slice(0, 24);
}

/** Records one event; never throws and never slows the caller's answer by more than one insert. */
export async function track(request: Request, name: EventName, detail: { ticker?: string | null; path?: string | null } = {}): Promise<void> {
  if (!tigerEnabled() || isBot(request)) return;
  try {
    await getPool().query("INSERT INTO product_events (actor, name, ticker, path) VALUES ($1, $2, $3, $4)", [
      await actor(request),
      name,
      detail.ticker?.slice(0, 12) ?? null,
      detail.path?.split("?")[0].slice(0, 120) ?? null,
    ]);
  } catch {
    // Analytics must never break the product.
  }
}
