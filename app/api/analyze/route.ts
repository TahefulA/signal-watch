import type { AnalyzeEvent } from "@/types";
import { AnalyzeError, analyzeTicker } from "@/lib/analyze";
import { findRecentReport, saveReport, tigerEnabled } from "@/lib/tiger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Reports are reused for this long before the filings are read again. */
const CACHE_HOURS = 12;

interface AnalyzeBody {
  ticker?: unknown;
  fresh?: unknown;
}

/**
 * POST { ticker, fresh? } and receive newline-delimited JSON: step events while
 * the pipeline runs, then one result or error event.
 */
export async function POST(request: Request): Promise<Response> {
  let body: AnalyzeBody;
  try {
    body = (await request.json()) as AnalyzeBody;
  } catch {
    body = {};
  }
  const ticker = typeof body.ticker === "string" ? body.ticker.trim().toUpperCase() : "";
  const fresh = body.fresh === true;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AnalyzeEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        if (!fresh && tigerEnabled() && ticker) {
          const cached = await findRecentReport(ticker, CACHE_HOURS).catch(() => null);
          if (cached) {
            send({ type: "result", report: cached, cached: true });
            return;
          }
        }
        const report = await analyzeTicker(ticker, (step) => send({ type: "step", step }));
        if (tigerEnabled()) {
          await saveReport(report).catch((error: unknown) => console.error("Tiger Data save failed", error));
        }
        send({ type: "result", report, cached: false });
      } catch (error) {
        const message =
          error instanceof AnalyzeError ? error.message : "Something went wrong while analyzing this ticker. Please try again.";
        if (!(error instanceof AnalyzeError)) console.error("Analyze failed", error);
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
