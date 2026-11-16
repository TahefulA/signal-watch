import { EVENTS, type EventName, track } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Events only the browser sees. Server-side events (analysis_run, watch_add, sign_in, alerts) are recorded where they happen. */
const CLIENT_EVENTS = new Set<EventName>(["page_view", "report_view", "share"]);

/** POST { name, ticker?, path? } from lib/track.ts. */
export async function POST(request: Request): Promise<Response> {
  let body: { name?: unknown; ticker?: unknown; path?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(null, { status: 400 });
  }
  const name = body.name as EventName;
  if (!EVENTS.includes(name) || !CLIENT_EVENTS.has(name)) return new Response(null, { status: 400 });
  const ticker = typeof body.ticker === "string" && /^[A-Z][A-Z0-9.\-]{0,9}$/.test(body.ticker) ? body.ticker : null;
  await track(request, name, { ticker, path: typeof body.path === "string" ? body.path : null });
  return new Response(null, { status: 204 });
}
