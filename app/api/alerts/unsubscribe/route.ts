import { getPool, tigerEnabled } from "@/lib/tiger";
import { traced } from "@/lib/llm-trace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const page = (text: string) =>
  new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Signal Watch</title><body style="font:16px system-ui;background:#09090b;color:#e4e4e7;display:grid;place-items:center;min-height:90vh"><p>${text} <a style="color:#fafafa" href="/">Back to Signal Watch</a></p></body>`, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

/** GET ?token=: the link at the bottom of every alert email. */
async function handleGET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!tigerEnabled() || !/^[0-9a-f-]{36}$/.test(token)) return page("That link is not valid.");
  // A subscription made from a signed-in watchlist turns off that account's watchlist emails; the next run would only add it back otherwise.
  const owner = await getPool().query<{ user_id: string | null }>("DELETE FROM alert_subs WHERE token = $1 RETURNING user_id", [token]);
  const userId = owner.rows[0]?.user_id;
  if (userId) {
    await getPool().query("UPDATE users SET watch_alerts = false WHERE id = $1", [userId]);
    await getPool().query("DELETE FROM alert_subs WHERE user_id = $1", [userId]);
    return page("Done: your watchlist emails are off. Turn them back on from the account menu.");
  }
  return page(owner.rowCount ? "Done: you won't get these emails any more." : "You were already unsubscribed.");
}

export const GET = traced("alerts/unsubscribe", handleGET);
