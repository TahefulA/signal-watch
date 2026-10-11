import { toIsoDate } from "@/lib/dates";
import { PRIVATE_LIMITS, type PrivateDocument, generatePrivateCase } from "@/lib/devils-private";
import { geminiEnabled } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST { company, period?, thesis, documents: [{ name, text }] } and receive
 * { devil }: the case against the thesis, written from the documents' text.
 * Text is extracted in the browser; nothing is saved.
 */
export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "The request could not be read." }, { status: 400 });
  }
  if (!geminiEnabled()) return Response.json({ error: "The model is not configured." }, { status: 503 });
  const company = typeof body.company === "string" ? body.company.trim().slice(0, 120) : "";
  const period = typeof body.period === "string" && body.period.trim() ? body.period.trim().slice(0, 60) : null;
  const thesis = typeof body.thesis === "string" ? body.thesis.trim().slice(0, PRIVATE_LIMITS.thesis) : "";
  const documents = (Array.isArray(body.documents) ? body.documents : [])
    .filter((d): d is PrivateDocument => typeof d === "object" && d !== null && typeof d.name === "string" && typeof d.text === "string")
    .map((d) => ({ name: d.name.slice(0, 120), text: d.text }))
    .filter((d) => d.text.trim().length > 200)
    .slice(0, PRIVATE_LIMITS.documents);
  if (!company) return Response.json({ error: "Name the company." }, { status: 400 });
  if (thesis.length < 40) return Response.json({ error: "Write the thesis or paste the memo to argue against (a few sentences at least)." }, { status: 400 });
  if (documents.length === 0) return Response.json({ error: "Add at least one document with readable text." }, { status: 400 });
  if (documents.reduce((n, d) => n + d.text.length, 0) > PRIVATE_LIMITS.characters) {
    return Response.json({ error: "The documents are too long together; remove one and try again." }, { status: 413 });
  }
  try {
    const devil = await generatePrivateCase({ company, period, thesis, documents }, toIsoDate(new Date()));
    return Response.json({ devil });
  } catch (error) {
    console.error("Private case failed", error);
    return Response.json({ error: "The case could not be written. Please try again." }, { status: 500 });
  }
}
