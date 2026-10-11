import { toIsoDate } from "@/lib/dates";
import { generateDevilsAdvocate } from "@/lib/devils-advocate";
import { loadPatternContext } from "@/lib/devils-advocate-patterns";
import { findReportById, tigerEnabled, updateReport } from "@/lib/tiger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST { reportId } and receive { devil }: the counter-argument, its citations and every pattern's result. Saved on the report. */
export async function POST(request: Request): Promise<Response> {
  let body: { reportId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  if (!tigerEnabled())
    return Response.json({ error: "The counter-argument needs saved reports, and storage is not configured." }, { status: 503 });
  const reportId = typeof body.reportId === "string" ? body.reportId : "";
  try {
    const report = await findReportById(reportId);
    if (!report) return Response.json({ error: "This report is no longer available. Run the analysis again." }, { status: 404 });
    const ctx = await loadPatternContext(report, toIsoDate(new Date()));
    const devil = await generateDevilsAdvocate(report, ctx);
    await updateReport({ ...report, devil });
    return Response.json({ devil });
  } catch (error) {
    console.error("Devil's Advocate failed", error);
    return Response.json({ error: "The counter-argument could not be written. Please try again." }, { status: 500 });
  }
}
