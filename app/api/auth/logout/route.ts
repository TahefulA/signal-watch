import { signOut } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST: ends this browser's session. */
export async function POST(request: Request): Promise<Response> {
  const cleared = await signOut(request).catch(() => null);
  return Response.json({ ok: true }, cleared ? { headers: { "Set-Cookie": cleared } } : undefined);
}
