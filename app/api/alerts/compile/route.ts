import { compileQuestion } from "@/lib/alerts/compiler";
import { describe } from "@/lib/alerts/predicate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST { question } and receive { rule, description } or { error, unsupported, errors }. The rule runs in the browser, not here. */
export async function POST(request: Request): Promise<Response> {
  let body: { question?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (question.length < 8) return Response.json({ error: "Ask a question of at least a few words." }, { status: 400 });
  try {
    const result = await compileQuestion(question);
    if (!result.ok) return Response.json({ error: result.reason, unsupported: result.unsupported, errors: result.errors }, { status: 422 });
    return Response.json({ rule: result.rule, description: describe(result.rule), attempts: result.attempts, ms: result.ms });
  } catch (error) {
    console.error("Alert compile failed", error);
    return Response.json({ error: "The question could not be compiled. Please try again." }, { status: 500 });
  }
}
