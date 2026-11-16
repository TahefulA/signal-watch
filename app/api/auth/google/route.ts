import { createHash, randomBytes } from "node:crypto";
import { OAUTH_COOKIE, cookie, googleEnabled, safeNext } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?next=/path: starts Google sign-in (authorization code flow with PKCE and a state check). */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (!googleEnabled()) return Response.redirect(new URL("/?signin=unavailable", url), 302);
  const state = randomBytes(16).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const next = safeNext(url.searchParams.get("next"));

  const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  google.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: `${url.origin}/api/auth/callback/google`,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();

  return new Response(null, {
    status: 302,
    headers: { Location: google.toString(), "Set-Cookie": cookie(OAUTH_COOKIE, JSON.stringify({ state, verifier, next }), 600) },
  });
}
