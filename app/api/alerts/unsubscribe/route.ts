import { getPool, tigerEnabled } from "@/lib/tiger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const page = (text: string) =>
  new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Signal Watch</title><body style="font:16px system-ui;background:#09090b;color:#e4e4e7;display:grid;place-items:center;min-height:90vh"><p>${text} <a style="color:#fafafa" href="/">Back to Signal Watch</a></p></body>`, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

/** GET ?token=: the link at the bottom of every alert email. */
export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!tigerEnabled() || !/^[0-9a-f-]{36}$/.test(token)) return page("That link is not valid.");
  const r = await getPool().query("DELETE FROM alert_subs WHERE token = $1", [token]);
  return page(r.rowCount ? "Done: you won't get these emails any more." : "You were already unsubscribed.");
}
