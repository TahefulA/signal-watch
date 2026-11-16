import { currentUser, googleEnabled } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET: who is signed in, and whether sign-in is offered at all. */
export async function GET(request: Request): Promise<Response> {
  const user = await currentUser(request).catch(() => null);
  return Response.json({ user: user ? { email: user.email, name: user.name } : null, enabled: googleEnabled() }, { headers: { "Cache-Control": "no-store" } });
}
