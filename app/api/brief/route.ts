import { generateBrief } from "@/lib/brief";
import { toIsoDate } from "@/lib/dates";
import { findReportById, tigerEnabled, updateReport } from "@/lib/tiger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

/** POST { reportId } and receive { brief }. The brief is saved on the report for /brief/<id>. */
export async function POST(request: Request): Promise<Response> {
  let body: { reportId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  if (!tigerEnabled()) return Response.json({ error: "Meeting prep needs saved reports, and storage is not configured." }, { status: 503 });
  const reportId = typeof body.reportId === "string" ? body.reportId : "";
  try {
    const report = await findReportById(reportId);
    if (!report) return Response.json({ error: "This report is no longer available. Run the analysis again." }, { status: 404 });
    const brief = await generateBrief(report, toIsoDate(new Date()));
    await updateReport({ ...report, brief });
    return Response.json({ brief });
  } catch (error) {
    console.error("Meeting brief failed", error);
    return Response.json({ error: "The brief could not be prepared. Please try again." }, { status: 500 });
  }
}
