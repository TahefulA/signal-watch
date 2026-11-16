import { currentUser } from "@/lib/auth";
import { getPool } from "@/lib/tiger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { on }: turns the signed-in account's daily watchlist email on or off. */
export async function POST(request: Request): Promise<Response> {
  const user = await currentUser(request).catch(() => null);
  if (!user) return Response.json({ error: "Sign in to get watchlist emails." }, { status: 401 });
  let body: { on?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const on = body.on === true;
  await getPool().query("UPDATE users SET watch_alerts = $2 WHERE id = $1", [user.id, on]);
  if (!on) await getPool().query("DELETE FROM alert_subs WHERE user_id = $1", [user.id]);
  return Response.json({ watchAlerts: on });
}
