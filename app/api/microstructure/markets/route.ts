import { topMarkets } from "@/lib/stream/polymarket";
import { traced } from "@/lib/llm-trace";

export const dynamic = "force-dynamic";

/** GET: the most traded open Polymarket markets, finance first. The order book itself streams to the browser straight from Polymarket. */
async function handleGET() {
  try {
    return Response.json(await topMarkets(12));
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 502 });
  }
}

export const GET = traced("microstructure/markets", handleGET);
