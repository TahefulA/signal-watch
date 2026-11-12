import { tableNews } from "@/lib/committee/news";
import { patternsFor } from "@/lib/committee/patterns";
import { toIsoDate } from "@/lib/dates";
import { findReportById, saveCommittee, tigerEnabled } from "@/lib/tiger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST { reportId } and receive { record, added } when a new headline bears on
 * the credit (the Chair's news line and the committee's answer, saved), or
 * { message } when nothing new does.
 */
export async function POST(request: Request): Promise<Response> {
  let body: { reportId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  if (!tigerEnabled()) return Response.json({ error: "Saved reports are not available." }, { status: 503 });
  const report = await findReportById(typeof body.reportId === "string" ? body.reportId : "").catch(() => null);
  if (!report?.committee) return Response.json({ error: "Run the committee first." }, { status: 404 });
  try {
    const patterns = await patternsFor(report, toIsoDate(new Date()));
    const result = await tableNews(report, patterns, report.committee);
    if ("record" in result) await saveCommittee(report, result.record);
    return Response.json(result);
  } catch (error) {
    console.error("Live news failed", error);
    return Response.json({ error: "The news could not be read. Please try again." }, { status: 500 });
  }
}
