import { NextResponse } from "next/server";
import { TIMELINE_VERSION, buildTimeline } from "@/lib/timeline";
import { findReportById, tigerEnabled, updateReport } from "@/lib/tiger";

export const runtime = "nodejs";
export const maxDuration = 300;

/** The report's timeline: built from the last twelve 10-Q and 10-K filings on first request, then saved with the report. */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("reportId") ?? "";
  if (!tigerEnabled()) return NextResponse.json({ error: "Saved reports are not available." }, { status: 404 });
  const report = await findReportById(id).catch(() => null);
  if (!report) return NextResponse.json({ error: "This report is no longer available." }, { status: 404 });
  if (report.timeline?.version === TIMELINE_VERSION) return NextResponse.json({ timeline: report.timeline });
  try {
    const timeline = await buildTimeline(report);
    await updateReport({ ...report, timeline }).catch(() => undefined);
    return NextResponse.json({ timeline });
  } catch (error) {
    console.error("timeline", error);
    return NextResponse.json({ error: "The filing history could not be read from EDGAR. Try again shortly." }, { status: 502 });
  }
}
