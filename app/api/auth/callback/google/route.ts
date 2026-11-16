import { OAUTH_COOKIE, cookie, googleEnabled, readCookie, safeNext, signIn } from "@/lib/auth";
import { readVisitor } from "@/lib/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IdClaims = { iss?: string; aud?: string; sub?: string; email?: string; email_verified?: boolean; name?: string; exp?: number };

/**
 * Google sends the browser back here with a code. The code is exchanged
 * server to server over TLS, so the ID token in the reply comes straight from
 * Google and its claims are checked without a signature check (OpenID Connect
 * Core 3.1.3.7, item 6).
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const fail = (reason: string) => {
    console.warn("Sign-in failed:", reason);
    return new Response(null, { status: 302, headers: { Location: "/?signin=failed", "Set-Cookie": cookie(OAUTH_COOKIE, "", 0) } });
  };
  if (!googleEnabled()) return fail("not configured");

  let saved: { state?: string; verifier?: string; next?: string };
  try {
    saved = JSON.parse(readCookie(request, OAUTH_COOKIE) ?? "{}") as typeof saved;
  } catch {
    saved = {};
  }
  const code = url.searchParams.get("code");
  if (!code || !saved.state || !saved.verifier || url.searchParams.get("state") !== saved.state) return fail("state mismatch or missing code");

  const token = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: `${url.origin}/api/auth/callback/google`,
      grant_type: "authorization_code",
      code_verifier: saved.verifier,
    }),
  }).catch(() => null);
  if (!token?.ok) return fail(`token exchange ${token?.status ?? "network"}`);
  const { id_token } = (await token.json()) as { id_token?: string };
  if (!id_token) return fail("no id_token");

  let claims: IdClaims;
  try {
    claims = JSON.parse(Buffer.from(id_token.split(".")[1], "base64url").toString("utf8")) as IdClaims;
  } catch {
    return fail("unreadable id_token");
  }
  const issuerOk = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
  if (!issuerOk || claims.aud !== process.env.GOOGLE_CLIENT_ID || !claims.sub || !claims.email || claims.email_verified !== true || (claims.exp ?? 0) * 1000 < Date.now()) {
    return fail("claims rejected");
  }

  try {
    const session = await signIn({ sub: claims.sub, email: claims.email.toLowerCase(), name: claims.name ?? null }, readVisitor(request));
    const headers = new Headers({ Location: safeNext(saved.next) });
    headers.append("Set-Cookie", session);
    headers.append("Set-Cookie", cookie(OAUTH_COOKIE, "", 0));
    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error("Sign-in storage failed", error);
    return fail("storage");
  }
}
