import type { Report } from "@/types";
import { toIsoDate } from "@/lib/dates";
import { generateDevilsAdvocate } from "@/lib/devils-advocate";
import { loadPatternContext } from "@/lib/devils-advocate-patterns";
import { findReportById, tigerEnabled, updateReport } from "@/lib/tiger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST { reportId, peerReportIds? } and receive { devil }: the structured case, its evidence and every pattern's result. Saved on the report. */
export async function POST(request: Request): Promise<Response> {
  let body: { reportId?: unknown; peerReportIds?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  if (!tigerEnabled())
    return Response.json({ error: "The counter-argument needs saved reports, and storage is not configured." }, { status: 503 });
  const reportId = typeof body.reportId === "string" ? body.reportId : "";
  const peerIds = Array.isArray(body.peerReportIds) ? body.peerReportIds.filter((v): v is string => typeof v === "string").slice(0, 3) : [];
  try {
    const report = await findReportById(reportId);
    if (!report) return Response.json({ error: "This report is no longer available. Run the analysis again." }, { status: 404 });
    const [ctx, peers] = await Promise.all([
      loadPatternContext(report, toIsoDate(new Date())),
      Promise.all(peerIds.map((id) => findReportById(id).catch(() => null))),
    ]);
    const devil = await generateDevilsAdvocate(report, ctx, peers.filter((p): p is Report => p !== null));
    await updateReport({ ...report, devil });
    return Response.json({ devil });
  } catch (error) {
    console.error("Devil's Advocate failed", error);
    return Response.json({ error: "The counter-argument could not be written. Please try again." }, { status: 500 });
  }
}
