import { cachedFetchText } from "./fetch-cache";

/**
 * Kalshi's Fed markets as a rate path. Each Fed meeting is a ladder of
 * contracts, "Will the upper bound of the federal funds rate be above k%?",
 * and a contract's price is the market's probability of that outcome. A
 * strike is used only when its bid and ask are close; a wide spread is an
 * illiquid quote, not an opinion. Prices are then made non-increasing in the
 * strike (the chance of a rate above 4.5% cannot exceed the chance of a rate
 * above 4.25%). Everything after that is arithmetic on those probabilities.
 */

const API = "https://api.elections.kalshi.com/trade-api/v2";
export const FED_SERIES = "KXFED";
/** Widest bid-ask spread, in dollars per $1 contract, still read as a price. */
const MAX_SPREAD = 0.15;
const STEP = 0.25;

interface RawMarket {
  ticker: string;
  event_ticker: string;
  floor_strike?: number;
  close_time: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  last_price_dollars?: string;
  volume_fp?: string;
  result?: string;
}

export interface StrikeQuote {
  strike: number;
  /** Probability the upper bound ends above the strike, after the monotone fix. */
  pAbove: number;
  bid: number;
  ask: number;
  ticker: string;
}

export interface FedMeeting {
  event: string;
  /** Meeting date, from the contracts' close time. */
  date: string;
  /** Market-implied expected upper bound, in percent. */
  expectedUpper: number;
  /** Upper bound at the 90th percentile of the market's distribution: a stress case it still prices. */
  stressUpper: number;
  /** Probability the upper bound ends above the current one (a hike), and below it (a cut). */
  pHike: number;
  pCut: number;
  /** Widest run of interpolated strikes, in percentage points: large gaps make the estimate rougher. */
  widestGap: number;
  strikes: StrikeQuote[];
  url: string;
}

export interface FedPath {
  /** Upper bound set at the most recent settled meeting. */
  currentUpper: number | null;
  currentAsOf: string | null;
  meetings: FedMeeting[];
  fetchedAt: string;
  source: string;
}

async function get<T>(path: string, maxAgeMs: number): Promise<T> {
  const raw = await cachedFetchText(`${API}${path}`, { throttleKey: "kalshi", minIntervalMs: 120, maxAgeMs, timeoutMs: 15_000 });
  return JSON.parse(raw) as T;
}

async function markets(status: "open" | "settled", maxAgeMs: number): Promise<RawMarket[]> {
  const out: RawMarket[] = [];
  let cursor = "";
  for (let page = 0; page < 10; page++) {
    const body = await get<{ markets: RawMarket[]; cursor?: string }>(
      `/markets?series_ticker=${FED_SERIES}&status=${status}&limit=200${cursor ? `&cursor=${cursor}` : ""}`,
      maxAgeMs,
    );
    out.push(...body.markets);
    if (!body.cursor || body.markets.length === 0) break;
    cursor = body.cursor;
  }
  return out;
}

const num = (s: string | undefined) => (s === undefined ? NaN : Number(s));

function byEvent(list: RawMarket[]): Map<string, RawMarket[]> {
  const map = new Map<string, RawMarket[]>();
  for (const m of list) map.set(m.event_ticker, [...(map.get(m.event_ticker) ?? []), m]);
  return map;
}

/** Liquid strikes, ascending, with probabilities forced to fall as the strike rises. */
export function ladder(list: RawMarket[]): StrikeQuote[] {
  const quotes = list
    .filter((m) => typeof m.floor_strike === "number")
    .map((m) => ({ strike: m.floor_strike as number, bid: num(m.yes_bid_dollars), ask: num(m.yes_ask_dollars), ticker: m.ticker }))
    .filter((q) => Number.isFinite(q.bid) && Number.isFinite(q.ask) && q.ask - q.bid <= MAX_SPREAD)
    .sort((a, b) => a.strike - b.strike);
  let ceiling = 1;
  return quotes.map((q) => {
    const p = Math.min(ceiling, Math.max(0, (q.bid + q.ask) / 2));
    ceiling = p;
    return { ...q, pAbove: p };
  });
}

/**
 * P(U > k) on a quarter-point grid from the lowest liquid strike to the
 * highest. Strikes skipped for a wide spread are filled by straight-line
 * interpolation between their liquid neighbours, never by carrying a price
 * across the gap. Above the highest liquid strike the curve is taken as zero.
 */
export function survival(strikes: StrikeQuote[]): { k: number; p: number }[] {
  const grid: { k: number; p: number }[] = [];
  for (let i = 0; i < strikes.length; i++) {
    const a = strikes[i];
    grid.push({ k: a.strike, p: a.pAbove });
    const b = strikes[i + 1];
    if (!b) break;
    const steps = Math.round((b.strike - a.strike) / STEP);
    for (let j = 1; j < steps; j++) grid.push({ k: a.strike + j * STEP, p: a.pAbove + ((b.pAbove - a.pAbove) * j) / steps });
  }
  return grid;
}

/**
 * Expected upper bound and its 90th percentile from the survival curve. The
 * rate moves in quarter points, so U > k means U >= k + 0.25 and
 * E[U] = k0 + 0.25 * (sum of P(U > k) over the grid), with rates below the
 * lowest liquid strike k0 treated as impossible (those strikes trade near $1).
 * The 90th percentile is the first grid point where P(U > k) drops below 10%.
 */
export function summarize(strikes: StrikeQuote[], current: number | null) {
  if (strikes.length < 3) return null;
  const grid = survival(strikes);
  const k0 = grid[0].k;
  const expected = k0 + STEP * grid.reduce((sum, g) => sum + g.p, 0);
  const stress = grid.find((g) => g.p < 0.1)?.k ?? grid[grid.length - 1].k + STEP;
  const at = (k: number) => {
    if (k < k0 - 1e-9) return 1;
    const point = grid.find((g) => Math.abs(g.k - k) < 1e-9);
    return point ? point.p : 0;
  };
  const pHike = current === null ? 0 : at(current);
  const pCut = current === null ? 0 : 1 - at(current - STEP);
  return { expectedUpper: Number(expected.toFixed(3)), stressUpper: stress, pHike, pCut };
}

export async function fetchFedPath(maxAgeMs = 30 * 60_000): Promise<FedPath> {
  const [open, settled] = await Promise.all([markets("open", maxAgeMs), markets("settled", 6 * 3_600_000).catch(() => [])]);

  // The current upper bound: the latest settled meeting's highest strike that resolved yes, plus a quarter point.
  let currentUpper: number | null = null;
  let currentAsOf: string | null = null;
  for (const [, list] of byEvent(settled)) {
    const date = list[0].close_time.slice(0, 10);
    const yes = list.filter((m) => m.result === "yes" && typeof m.floor_strike === "number").map((m) => m.floor_strike as number);
    if (!yes.length || (currentAsOf && date <= currentAsOf)) continue;
    currentAsOf = date;
    currentUpper = Math.max(...yes) + STEP;
  }

  const meetings: FedMeeting[] = [];
  for (const [event, list] of byEvent(open)) {
    const strikes = ladder(list);
    const s = summarize(strikes, currentUpper);
    if (!s) continue;
    meetings.push({
      event,
      date: list[0].close_time.slice(0, 10),
      ...s,
      // Only gaps the probability falls across matter; a gap in the flat tails changes nothing.
      widestGap: strikes.reduce((w, q, i) => (i && strikes[i - 1].pAbove - q.pAbove > 0.1 ? Math.max(w, q.strike - strikes[i - 1].strike) : w), 0),
      strikes,
      url: `https://kalshi.com/markets/${FED_SERIES.toLowerCase()}/${event.toLowerCase()}`,
    });
  }
  meetings.sort((a, b) => a.date.localeCompare(b.date));
  return { currentUpper, currentAsOf, meetings, fetchedAt: new Date().toISOString(), source: `${API}/markets?series_ticker=${FED_SERIES}` };
}

/**
 * The meeting closest to a number of days ahead, for a one-year view. Meetings
 * whose ladder has no gap wider than three quarter points where prices fall are preferred.
 */
export function meetingNear(path: FedPath, today: string, days: number): FedMeeting | null {
  const target = Date.parse(today) + days * 86_400_000;
  const dense = path.meetings.filter((m) => m.widestGap <= 0.75);
  let best: FedMeeting | null = null;
  for (const m of dense.length ? dense : path.meetings) {
    if (m.date <= today) continue;
    if (!best || Math.abs(Date.parse(m.date) - target) < Math.abs(Date.parse(best.date) - target)) best = m;
  }
  return best;
}

export interface DailyPoint {
  date: string;
  /** Bid-ask midpoint at the day's close. */
  mid: number;
}

/** Daily closing midpoints for one contract, for the lead/lag test. */
export async function fetchDailyHistory(ticker: string, startIso: string, endIso: string): Promise<DailyPoint[]> {
  const start = Math.floor(Date.parse(startIso) / 1000);
  const end = Math.floor(Date.parse(endIso) / 1000);
  const body = await get<{
    candlesticks: { end_period_ts: number; yes_bid?: { close_dollars?: string }; yes_ask?: { close_dollars?: string } }[];
  }>(`/series/${FED_SERIES}/markets/${ticker}/candlesticks?start_ts=${start}&end_ts=${end}&period_interval=1440`, 12 * 3_600_000);
  return body.candlesticks
    .map((c) => {
      const bid = num(c.yes_bid?.close_dollars);
      const ask = num(c.yes_ask?.close_dollars);
      return { date: new Date(c.end_period_ts * 1000).toISOString().slice(0, 10), mid: (bid + ask) / 2, spread: ask - bid };
    })
    .filter((p) => Number.isFinite(p.mid) && p.spread <= MAX_SPREAD)
    .map(({ date, mid }) => ({ date, mid }));
}
