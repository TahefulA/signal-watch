import { getPool } from "../tiger";

/** The daily alert email: who gets one, and what it says. Used by /api/alerts/run. */

export type Sub = { token: string; email: string; ticker: string; user_id: string | null; last_prob: number | null; last_event: string | null; created_at: string };
export type Change = { sub: Sub; name: string; lines: string[]; prob: number | null; newest: string };

/** Signed-in accounts with watchlist emails on get one subscription per watched ticker; unwatched ones are dropped. */
export async function syncWatchlistSubs(): Promise<void> {
  await getPool().query(
    `INSERT INTO alert_subs (token, email, ticker, user_id)
     SELECT gen_random_uuid()::text, u.email, w.ticker, u.id FROM users u JOIN visitor_watchlist w ON w.visitor = 'u:' || u.id::text
      WHERE u.watch_alerts
     ON CONFLICT (email, ticker) DO NOTHING`,
  );
  await getPool().query(
    `DELETE FROM alert_subs s WHERE s.user_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM users u JOIN visitor_watchlist w ON w.visitor = 'u:' || u.id::text
        WHERE u.id = s.user_id AND u.watch_alerts AND w.ticker = s.ticker)`,
  );
}

/** One email for everything that changed for one address, with a way out for each subscription. */
export function compose(changes: Change[], base: string): { subject: string; text: string } {
  const subject =
    changes.length === 1
      ? `Signal Watch: ${changes[0].sub.ticker} ${changes[0].lines[0]?.startsWith("12-month") ? "odds moved" : "filed something new"}`
      : `Signal Watch: ${changes.length} companies you watch changed (${changes.map((c) => c.sub.ticker).join(", ")})`;
  const blocks = changes.map((c) => `${c.name} (${c.sub.ticker})\n${c.lines.join("\n")}\nOpen it: ${base}/c/${c.sub.ticker}`);
  const fromWatchlist = changes.find((c) => c.sub.user_id);
  const singles = changes.filter((c) => !c.sub.user_id);
  const stops = [
    ...(fromWatchlist ? [`Stop watchlist emails: ${base}/api/alerts/unsubscribe?token=${fromWatchlist.sub.token}`] : []),
    ...singles.map((c) => `Stop emails about ${c.sub.ticker}: ${base}/api/alerts/unsubscribe?token=${c.sub.token}`),
  ];
  return { subject, text: `${blocks.join("\n\n")}\n\n${stops.join("\n")}\n\nNot investment advice.` };
}

