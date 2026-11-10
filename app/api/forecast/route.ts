import { ensureForecast } from "@/lib/forecast-report";
import { findReportById, tigerEnabled, updateReport } from "@/lib/tiger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST { reportId } and receive { distress, filingChange, rateStress }. Reports
 * saved before the forecast layer existed get it here the first time they open,
 * and the rate stress is refreshed once a day.
 */
export async function POST(request: Request): Promise<Response> {
  let body: { reportId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  if (!tigerEnabled()) return Response.json({ error: "The forecast needs saved reports, and storage is not configured." }, { status: 503 });
  const report = await findReportById(typeof body.reportId === "string" ? body.reportId : "").catch(() => null);
  if (!report) return Response.json({ error: "This report is no longer available. Run the analysis again." }, { status: 404 });
  try {
    const { report: next, changed } = await ensureForecast(report);
    if (changed) await updateReport(next);
    return Response.json({ distress: next.distress ?? null, filingChange: next.filingChange ?? null, rateStress: next.rateStress ?? null });
  } catch (error) {
    console.error("Forecast failed", error);
    return Response.json({ error: "The forecast could not be computed. Please try again." }, { status: 500 });
  }
}
