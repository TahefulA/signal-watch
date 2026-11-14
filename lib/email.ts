/**
 * Sends email through Resend's HTTP API when RESEND_API_KEY and ALERT_FROM
 * are set; otherwise reports that it cannot, so callers can hold their state
 * until it can. No SDK: one POST.
 */
export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.ALERT_FROM);
}

export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  if (!emailEnabled()) return false;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.ALERT_FROM, to, subject, text }),
  });
  if (!r.ok) console.error("Email failed", r.status, await r.text().catch(() => ""));
  return r.ok;
}

export function siteUrl(): string {
  return process.env.SITE_URL ?? "https://signal-watch-phi.vercel.app";
}
