import { SESSION_COOKIE, cookie, currentUser, deleteAccount } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST: deletes the signed-in account, its watchlist and its email alerts. */
export async function POST(request: Request): Promise<Response> {
  const user = await currentUser(request).catch(() => null);
  if (!user) return Response.json({ error: "You are not signed in." }, { status: 401 });
  try {
    await deleteAccount(user);
    return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie(SESSION_COOKIE, "", 0) } });
  } catch (error) {
    console.error("Account delete failed", error);
    return Response.json({ error: "That did not go through. Please try again." }, { status: 500 });
  }
}
