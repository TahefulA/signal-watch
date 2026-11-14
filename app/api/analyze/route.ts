import { overLimit } from "@/lib/visitor";
import type { AnalyzeEvent } from "@/types";
import { AnalyzeError, analyzeTicker } from "@/lib/analyze";
import { ensureForecast } from "@/lib/forecast-report";
import { findLatestReport, findRecentReport, saveReport, tigerEnabled, updateReport } from "@/lib/tiger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Reports are reused for this long before the filings are read again. */
/** Filings change at most daily, and the demo tickers are re-run once a day by the warm-up cron. */
const CACHE_HOURS = 26;

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
        const over = await overLimit(request, "analyze");
        if (over) {
          send({ type: "error", message: over });
          return;
        }
        let report = await analyzeTicker(ticker, (step) => send({ type: "step", step }));
        if (tigerEnabled()) {
          await saveReport(report).catch((error: unknown) => console.error("Tiger Data save failed", error));
        }
        // The forecast layer is scored after the save, so its score history can point at the report.
        send({ type: "step", step: "Scoring distress, filing changes and rate risk..." });
        const forecast = await ensureForecast(report).catch((error: unknown) => {
          console.error("Forecast failed", error);
          return null;
        });
        if (forecast?.changed) {
          report = forecast.report;
          if (tigerEnabled()) await updateReport(report).catch((error: unknown) => console.error("Tiger Data update failed", error));
        }
        send({ type: "result", report, cached: false });
      } catch (error) {
        // When the model service is down, the last saved report for the ticker is better than an error.
        if ((!(error instanceof AnalyzeError) || error.transient) && tigerEnabled() && ticker) {
          const saved = await findLatestReport(ticker).catch(() => null);
          if (saved) {
            console.warn(`Analyze failed for ${ticker}; serving the saved report from ${saved.generatedAt}`, error);
            send({ type: "result", report: saved, cached: true });
            return;
          }
        }
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
