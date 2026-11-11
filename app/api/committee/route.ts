import type { CommitteeEvent } from "@/types";
import { patternsFor } from "@/lib/committee/patterns";
import { runCommittee } from "@/lib/committee/run";
import { toIsoDate } from "@/lib/dates";
import { ensureForecast } from "@/lib/forecast-report";
import { ensureLme } from "@/lib/lme-report";
import { ensureSponsor } from "@/lib/contagion/report";
import { geminiEnabled } from "@/lib/gemini";
import { findReportById, saveCommittee, tigerEnabled, updateReport } from "@/lib/tiger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

/**
 * POST { reportId, fresh? } and receive newline-delimited CommitteeEvents: each
 * line as it is drafted (pending), its verification, the running score, the
 * Chair's summary, then the saved record. A saved committee is replayed
 * unless fresh is true.
 */
export async function POST(request: Request): Promise<Response> {
  let body: { reportId?: unknown; fresh?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: CommitteeEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        if (!tigerEnabled() || !geminiEnabled()) {
          send({ type: "error", message: "The committee needs saved reports and Gemini, and one of them is not configured." });
          return;
        }
        const saved = await findReportById(typeof body.reportId === "string" ? body.reportId : "").catch(() => null);
        if (!saved) {
          send({ type: "error", message: "This report is no longer available. Run the analysis again." });
          return;
        }
        if (saved.committee?.turns.length && body.fresh !== true) {
          send({ type: "done", record: saved.committee });
          return;
        }
        const today = toIsoDate(new Date());
        send({ type: "trace", text: "Quant: scoring distress, filing changes and rate exposure" });
        const forecast = await ensureForecast(saved, today);
        send({ type: "trace", text: "Reading the credit documents for trapdoors" });
        const scanned = await ensureLme(forecast.report, today, (text) => send({ type: "trace", text }));
        const owned = await ensureSponsor(scanned.report);
        const report = owned.report;
        if (forecast.changed || scanned.changed || owned.changed) await updateReport(report).catch(() => undefined);
        send({ type: "trace", text: "Running the contradiction checks" });
        const patterns = await patternsFor(report, today);
        const record = await runCommittee(report, patterns, send);
        // A committee that never got a line out is not saved: the next open convenes it again.
        if (!record.turns.length) {
          send({ type: "error", message: "Gemini is overloaded right now, so the committee could not meet. Please try Convene again in a minute." });
          return;
        }
        await saveCommittee(report, record).catch((error: unknown) => console.error("Committee save failed", error));
        send({ type: "done", record });
      } catch (error) {
        console.error("Committee failed", error);
        send({ type: "error", message: "The committee stopped before it finished. Please try again." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
