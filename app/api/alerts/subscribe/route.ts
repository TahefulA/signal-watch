import { randomUUID } from "node:crypto";
import { emailEnabled, sendEmail, siteUrl } from "@/lib/email";
import { getPool, tigerEnabled } from "@/lib/tiger";
import { limited } from "@/lib/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TICKER = /^[A-Z][A-Z0-9.\-]{0,9}$/;

/** POST { email, ticker }: email me when this company's odds move or it files something that matters. */
export async function POST(request: Request): Promise<Response> {
  if (!tigerEnabled()) return Response.json({ error: "Alerts need storage, which is not configured." }, { status: 503 });
  let body: { email?: unknown; ticker?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 200) : "";
  const ticker = typeof body.ticker === "string" ? body.ticker.trim().toUpperCase() : "";
  if (!EMAIL.test(email)) return Response.json({ error: "That email address does not look right." }, { status: 400 });
  if (!TICKER.test(ticker)) return Response.json({ error: "That is not a valid ticker." }, { status: 400 });
  const over = await limited(request, "subscribe");
  if (over) return over;
  try {
    const token = randomUUID();
    const rows = await getPool().query<{ token: string; inserted: boolean }>(
      "INSERT INTO alert_subs (token, email, ticker) VALUES ($1, $2, $3) ON CONFLICT (email, ticker) DO UPDATE SET email = EXCLUDED.email RETURNING token, (xmax = 0) AS inserted",
      [token, email, ticker],
    );
    const sub = rows.rows[0];
    if (sub?.inserted) {
      await sendEmail(
        email,
        `Signal Watch: watching ${ticker} for you`,
        `You'll get an email when ${ticker}'s 12-month bankruptcy odds move noticeably, or when it files something that matters (new debt, a missed payment, an auditor change and the like).\n\nOpen it: ${siteUrl()}/company?ticker=${ticker}\nStop these emails: ${siteUrl()}/api/alerts/unsubscribe?token=${sub.token}\n\nNot financial advice.`,
      ).catch(() => false);
    }
    return Response.json({ ok: true, sending: emailEnabled() });
  } catch (error) {
    console.error("Subscribe failed", error);
    return Response.json({ error: "That did not save. Please try again." }, { status: 500 });
  }
}
