/**
 * Polymarket's public order book feed, normalised. The market channel needs
 * no key: it sends one full book on subscribe, then a price_change for every
 * level that moves and a last_trade_price for every fill.
 */

export const POLYMARKET_WS = "wss://ws-subscriptions-clob.polymarket.com/ws/market";
export const GAMMA = "https://gamma-api.polymarket.com";
export const DATA_API = "https://data-api.polymarket.com/v2";

export interface Level {
  price: number;
  size: number;
}

export type BookEvent =
  | { kind: "book"; t: number; bids: Level[]; asks: Level[] }
  /** One price level's new total size; zero removes it. */
  | { kind: "level"; t: number; side: "bid" | "ask"; price: number; size: number }
  | { kind: "trade"; t: number; price: number; size: number; side: "buy" | "sell" };

export interface MarketInfo {
  id: string;
  conditionId: string;
  question: string;
  slug: string;
  /** The YES outcome's token: its book is the one followed. */
  assetId: string;
  /** The NO token. A fill there is the same trade seen from the other side: price 1 - p, opposite direction. */
  complementId: string | null;
  volume24h: number;
  url: string;
}

interface RawLevel {
  price: string;
  size: string;
}
interface RawMessage {
  event_type?: string;
  asset_id?: string;
  timestamp?: string;
  bids?: RawLevel[];
  asks?: RawLevel[];
  buys?: RawLevel[];
  sells?: RawLevel[];
  price_changes?: { asset_id: string; price: string; size: string; side: string }[];
  price?: string;
  size?: string;
  side?: string;
}

const level = (l: RawLevel): Level => ({ price: Number(l.price), size: Number(l.size) });

/** The events in one feed message for one market, in YES terms. */
export function parseMessage(data: string, assetId: string, complementId: string | null = null, now = Date.now()): BookEvent[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return [];
  }
  const out: BookEvent[] = [];
  for (const m of ([] as RawMessage[]).concat(parsed as RawMessage | RawMessage[])) {
    const t = m.timestamp ? Number(m.timestamp) : now;
    if (m.event_type === "book" && m.asset_id === assetId) {
      out.push({ kind: "book", t, bids: (m.bids ?? m.buys ?? []).map(level), asks: (m.asks ?? m.sells ?? []).map(level) });
    } else if (m.event_type === "price_change") {
      for (const c of m.price_changes ?? []) {
        if (c.asset_id !== assetId) continue;
        out.push({ kind: "level", t, side: c.side === "BUY" ? "bid" : "ask", price: Number(c.price), size: Number(c.size) });
      }
    } else if (m.event_type === "last_trade_price" && m.asset_id === assetId) {
      out.push({ kind: "trade", t, price: Number(m.price), size: Number(m.size), side: m.side === "SELL" ? "sell" : "buy" });
    } else if (m.event_type === "last_trade_price" && complementId && m.asset_id === complementId) {
      // Buying NO at p is selling YES at 1 - p.
      out.push({ kind: "trade", t, price: Math.round((1 - Number(m.price)) * 1e4) / 1e4, size: Number(m.size), side: m.side === "SELL" ? "buy" : "sell" });
    }
  }
  return out;
}

interface GammaMarket {
  id: string;
  conditionId: string;
  question: string;
  slug: string;
  clobTokenIds?: string;
  volume24hr?: number;
  events?: { slug: string }[];
}

/** The most traded open markets, finance first: rates, inflation and recession move credit. */
export async function topMarkets(limit = 12): Promise<MarketInfo[]> {
  const res = await fetch(`${GAMMA}/markets?active=true&closed=false&order=volume24hr&ascending=false&limit=60`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Polymarket markets: HTTP ${res.status}`);
  const rows = (await res.json()) as GammaMarket[];
  const markets = rows
    .filter((m) => m.clobTokenIds)
    .map((m) => ({
      id: m.id,
      conditionId: m.conditionId,
      question: m.question,
      slug: m.slug,
      assetId: (JSON.parse(m.clobTokenIds as string) as string[])[0],
      complementId: (JSON.parse(m.clobTokenIds as string) as string[])[1] ?? null,
      volume24h: m.volume24hr ?? 0,
      url: `https://polymarket.com/event/${m.events?.[0]?.slug ?? m.slug}`,
    }));
  const finance = /\bFed\b|interest rate|rate (?:cut|hike)|bps|inflation|CPI|recession|unemployment|treasury|yield|default|bankrupt|credit/i;
  return [...markets.filter((m) => finance.test(m.question)), ...markets.filter((m) => !finance.test(m.question))].slice(0, limit);
}

interface RawTrade {
  side: string;
  token_id: string;
  size: number;
  price: number;
  timestamp: number;
}

/** The market's latest fills from Polymarket's public trade history, oldest first, in YES terms. */
export async function recentTrades(market: Pick<MarketInfo, "conditionId" | "assetId" | "complementId">, limit = 300): Promise<BookEvent[]> {
  const res = await fetch(`${DATA_API}/trades?condition_id=${market.conditionId}&limit=${limit}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Polymarket trades: HTTP ${res.status}`);
  const body = (await res.json()) as { data?: RawTrade[] };
  return (body.data ?? [])
    .filter((r) => r.token_id === market.assetId || r.token_id === market.complementId)
    .map((r): BookEvent => {
      const yes = r.token_id === market.assetId;
      const buy = (r.side === "BUY") === yes;
      return { kind: "trade", t: r.timestamp * 1000, price: yes ? r.price : Math.round((1 - r.price) * 1e4) / 1e4, size: r.size, side: buy ? "buy" : "sell" };
    })
    .sort((a, b) => a.t - b.t);
}
