import type { AnalyzeEvent } from "@/types";
import { AnalyzeError, PIPELINE_VERSION, analyzeTicker } from "@/lib/analyze";
import { applyChanges, baselineDate, diffReports } from "@/lib/changes";
import { findBaseline, findReportById, saveChanges, saveReport, tigerEnabled } from "@/lib/tiger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST { reportId } and receive newline-delimited JSON. Builds (or reuses) a
 * baseline from the filings available before the report's newest 10-Q or 10-K,
 * compares the two, and returns the report with change markers.
 */
export async function POST(request: Request): Promise<Response> {
  let reportId = "";
  try {
    const body = (await request.json()) as { reportId?: unknown };
    reportId = typeof body.reportId === "string" ? body.reportId : "";
  } catch {
    reportId = "";
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AnalyzeEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        if (!tigerEnabled()) throw new AnalyzeError("Change detection needs saved reports, and storage is not configured.");
        const current = await findReportById(reportId);
        if (!current) throw new AnalyzeError("This report is no longer available. Run the analysis again.");
        const asOf = baselineDate(current);
        if (!asOf) throw new AnalyzeError("This report has no 10-Q or 10-K to compare against.");

        const ticker = current.graph.company.ticker;
        let baseline = await findBaseline(ticker, asOf, PIPELINE_VERSION);
        if (!baseline) {
          baseline = await analyzeTicker(ticker, (step) => send({ type: "step", step: `Previous quarter: ${step}` }), { asOf });
          await saveReport(baseline);
        }
        send({ type: "step", step: "Comparing filings..." });
        const { changes, removed, trends } = await diffReports(current, baseline);
        const updated = applyChanges(current, changes, removed, trends);
        await saveChanges(updated);
        send({ type: "result", report: updated, cached: true });
      } catch (error) {
        const message = error instanceof AnalyzeError ? error.message : "The comparison stopped before it finished. Please try again.";
        if (!(error instanceof AnalyzeError)) console.error("Change detection failed", error);
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
