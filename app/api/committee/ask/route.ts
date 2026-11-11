import { patternsFor } from "@/lib/committee/patterns";
import { MAX_QUESTIONS, askCommittee } from "@/lib/committee/run";
import { toIsoDate } from "@/lib/dates";
import { findReportById, saveCommittee, tigerEnabled } from "@/lib/tiger";
import { BASE_WHAT_IF, type WhatIf, describeWhatIf, runWhatIf } from "@/lib/what-if";

function parseWhatIf(raw: unknown): WhatIf | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const shock = typeof r.fcfShock === "number" && Number.isFinite(r.fcfShock) ? Math.min(2, Math.max(-1, r.fcfShock)) : 0;
  const upper = typeof r.upper === "number" && Number.isFinite(r.upper) ? Math.min(15, Math.max(0, r.upper)) : null;
  return { fcfShock: shock, upper, drawRevolver: r.drawRevolver === true, refinance: r.refinance === true };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST { reportId, question, whatIf? } and receive { record, added }: the
 * question and its verified answer, saved. A what-if is rerun here from the
 * report's filed figures, never taken from the browser as text.
 */
export async function POST(request: Request): Promise<Response> {
  let body: { reportId?: unknown; question?: unknown; whatIf?: unknown };
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
  if (report.committee.questionsAsked >= MAX_QUESTIONS) return Response.json({ error: "This session has taken a lot of questions. Convene the committee again to start a fresh one." }, { status: 429 });
  const inputs = report.rateStress?.inputs ?? null;
  const w = parseWhatIf(body.whatIf);
  const run = w && inputs ? runWhatIf(inputs, w) : null;
  const base = inputs ? runWhatIf(inputs, BASE_WHAT_IF) : null;
  // Code decides who argues the result: a shorter runway or less cash at the end is the Devil's Advocate's evidence.
  const worse = run && base ? (run.runsOutAt ?? "9999") < (base.runsOutAt ?? "9999") || (run.runsOutAt === base.runsOutAt && run.endingCash < base.endingCash) : false;
  const scenario = run ? { text: describeWhatIf(run, base), side: worse ? ("devil" as const) : ("analyst" as const) } : null;
  try {
    const patterns = await patternsFor(report, toIsoDate(new Date()));
    const { record, added } = await askCommittee(report, patterns, report.committee, question, scenario);
    await saveCommittee(report, record);
    return Response.json({ record, added });
  } catch (error) {
    console.error("Committee question failed", error);
    return Response.json({ error: "The question could not be answered. Please try again." }, { status: 500 });
  }
}
