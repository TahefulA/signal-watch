/**
 * Records a live Polymarket order book session for the microstructure page's
 * replay mode, so the demo always has real data to run on:
 *   npx tsx scripts/record-orderbook.ts [minutes] [market-id]
 *
 * Writes public/replays/<slug>.json: the market, when it was recorded, and
 * every book, level and trade event as it arrived. Nothing is generated.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { POLYMARKET_WS, parseMessage, recentTrades, topMarkets, type BookEvent } from "../lib/stream/polymarket";

async function main(): Promise<void> {
  const minutes = Number(process.argv[2] ?? 20);
  const wanted = process.argv[3];
  const markets = await topMarkets(30);
  for (const m of markets.slice(0, 12)) console.log(`  ${m.id}  ${m.question.slice(0, 80)}`);
  const market = (wanted ? markets.find((m) => m.id === wanted) : markets[0]) ?? markets[0];
  console.log(`Recording ${minutes} min of "${market.question}"`);
  const events: BookEvent[] = [];
  const startedAt = new Date().toISOString();
  // The fills before the session, kept with it: a replay warms up on what was known then, not on later history.
  const seed = await recentTrades(market, 300).catch(() => [] as BookEvent[]);

  await new Promise<void>((resolve) => {
    let ws: WebSocket;
    const connect = () => {
      ws = new WebSocket(POLYMARKET_WS);
      ws.onopen = () => ws.send(JSON.stringify({ assets_ids: [market.assetId, market.complementId].filter(Boolean), type: "market" }));
      ws.onmessage = (e) => events.push(...parseMessage(String(e.data), market.assetId, market.complementId));
      // The feed drops idle sockets; a reconnect sends a fresh book, which the replay applies like any other.
      ws.onclose = () => setTimeout(connect, 1_000);
    };
    connect();
    const ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send("PING"), 10_000);
    const tick = setInterval(() => console.log(`  ${events.length} events, ${events.filter((e) => e.kind === "trade").length} trades`), 60_000);
    setTimeout(() => {
      clearInterval(ping);
      clearInterval(tick);
      ws.onclose = null;
      ws.close();
      resolve();
    }, minutes * 60_000);
  });

  const name = `${market.slug.slice(0, 60)}.json`;
  const endedAt = new Date().toISOString();
  writeFileSync(`public/replays/${name}`, JSON.stringify({ market, startedAt, endedAt, seed, events }));
  // The page lists recordings from this index; a static file needs no server to read a directory.
  const index = existsSync("public/replays/index.json") ? (JSON.parse(readFileSync("public/replays/index.json", "utf8")) as { file: string }[]) : [];
  const entry = { file: name, question: market.question, startedAt, endedAt, events: events.length, trades: events.filter((e) => e.kind === "trade").length };
  writeFileSync("public/replays/index.json", JSON.stringify([entry, ...index.filter((x) => x.file !== name)], null, 1));
  console.log(`Wrote public/replays/${name}: ${events.length} events, ${entry.trades} trades`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
