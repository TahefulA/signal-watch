import { patternsFor } from "@/lib/committee/patterns";
import { MAX_QUESTIONS, askCommittee } from "@/lib/committee/run";
import { toIsoDate } from "@/lib/dates";
import { findReportById, saveCommittee, tigerEnabled } from "@/lib/tiger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST { reportId, question } and receive { record, added }: the question and its verified answer, saved. Three per committee. */
export async function POST(request: Request): Promise<Response> {
  let body: { reportId?: unknown; question?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (question.length < 5) return Response.json({ error: "Ask a question of at least a few words." }, { status: 400 });
  if (!tigerEnabled()) return Response.json({ error: "Saved reports are not available." }, { status: 503 });
  const report = await findReportById(typeof body.reportId === "string" ? body.reportId : "").catch(() => null);
  if (!report?.committee) return Response.json({ error: "Run the committee first." }, { status: 404 });
  if (report.committee.questionsAsked >= MAX_QUESTIONS) return Response.json({ error: `The committee takes ${MAX_QUESTIONS} questions; run it again for more.` }, { status: 429 });
  try {
    const patterns = await patternsFor(report, toIsoDate(new Date()));
    const { record, added } = await askCommittee(report, patterns, report.committee, question);
    await saveCommittee(report, record);
    return Response.json({ record, added });
  } catch (error) {
    console.error("Committee question failed", error);
    return Response.json({ error: "The question could not be answered. Please try again." }, { status: 500 });
  }
}
