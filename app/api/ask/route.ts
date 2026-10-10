import { answerQuestion } from "@/lib/ask";
import { findReportById, tigerEnabled } from "@/lib/tiger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST { reportId, question } and receive { answer } built only from that report. */
export async function POST(request: Request): Promise<Response> {
  let body: { reportId?: unknown; question?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 300) : "";
  const reportId = typeof body.reportId === "string" ? body.reportId : "";
  if (!question) return Response.json({ error: "Type a question first." }, { status: 400 });
  if (!tigerEnabled()) return Response.json({ error: "Questions need saved reports, and storage is not configured." }, { status: 503 });
  try {
    const report = await findReportById(reportId);
    if (!report) return Response.json({ error: "This report is no longer available. Run the analysis again." }, { status: 404 });
    return Response.json({ answer: await answerQuestion(report, question) });
  } catch (error) {
    console.error("Question failed", error);
    return Response.json({ error: "The question could not be answered. Please try again." }, { status: 500 });
  }
}
