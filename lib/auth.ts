import { createHash, randomBytes } from "node:crypto";
import { getPool, queryRows, tigerEnabled } from "./tiger";
import { readVisitor } from "./visitor";

/**
 * Sign-in with Google. A session is a random token in an HttpOnly cookie; only
 * its SHA-256 is stored, so a database leak does not leak live sessions.
 * Signed-out visitors keep the cookie-based watchlist from lib/visitor.ts, and
 * signing in carries that list over to the account.
 */

export const SESSION_COOKIE = "sw_session";
/** Holds the state, PKCE verifier and return path for the ten minutes a sign-in takes. */
export const OAUTH_COOKIE = "sw_oauth";
const SESSION_DAYS = 30;

export type User = { id: string; email: string; name: string | null };

export function googleEnabled(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && tigerEnabled());
}

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie") ?? "";
  const m = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function cookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax; Secure`;
}

export async function currentUser(request: Request): Promise<User | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || !tigerEnabled()) return null;
  const [row] = await queryRows<User>(
    `SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [hash(token)],
  );
  return row ?? null;
}

/** Whose watchlist a request reads and writes: the account when signed in, else the visitor cookie. */
export async function watchOwner(request: Request): Promise<string | null> {
  const user = await currentUser(request).catch(() => null);
  return user ? `u:${user.id}` : readVisitor(request);
}

/** Creates or updates the account for a verified Google identity, carries over the visitor's watchlist, and opens a session. */
export async function signIn(google: { sub: string; email: string; name: string | null }, visitor: string | null): Promise<string> {
  const [user] = await queryRows<{ id: string }>(
    `INSERT INTO users (google_sub, email, name) VALUES ($1, $2, $3)
     ON CONFLICT (google_sub) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, last_seen = NOW()
     RETURNING id`,
    [google.sub, google.email, google.name],
  );
  if (visitor) {
    await getPool().query(
      `INSERT INTO visitor_watchlist (visitor, ticker, added_at) SELECT $1, ticker, added_at FROM visitor_watchlist WHERE visitor = $2 ON CONFLICT DO NOTHING`,
      [`u:${user.id}`, visitor],
    );
  }
  const token = randomBytes(32).toString("base64url");
  await getPool().query(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '${SESSION_DAYS} days')`, [hash(token), user.id]);
  await getPool().query("DELETE FROM sessions WHERE user_id = $1 AND expires_at < NOW()", [user.id]);
  return cookie(SESSION_COOKIE, token, SESSION_DAYS * 86_400);
}

export async function signOut(request: Request): Promise<string> {
  const token = readCookie(request, SESSION_COOKIE);
  if (token && tigerEnabled()) await getPool().query("DELETE FROM sessions WHERE token_hash = $1", [hash(token)]);
  return cookie(SESSION_COOKIE, "", 0);
}

/** Removes the account and everything tied to it: sessions, watchlist and email alerts. */
export async function deleteAccount(user: User): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM visitor_watchlist WHERE visitor = $1", [`u:${user.id}`]);
    await client.query("DELETE FROM alert_subs WHERE email = $1", [user.email]);
    await client.query("DELETE FROM users WHERE id = $1", [user.id]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Only same-site paths, so the sign-in flow cannot be used as an open redirect. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}
