import { getPool, tigerEnabled } from "@/lib/tiger";
import { limited } from "@/lib/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** POST { message, email?, page } saves one piece of feedback. Read it with SQL on the feedback table. */
export async function POST(request: Request): Promise<Response> {
  if (!tigerEnabled()) return Response.json({ error: "Feedback storage is not configured." }, { status: 503 });
  let body: { message?: unknown; email?: unknown; page?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 2000) : "";
  const email = typeof body.email === "string" ? body.email.trim().slice(0, 200) : "";
  const page = typeof body.page === "string" ? body.page.slice(0, 300) : "";
  if (message.length < 3) return Response.json({ error: "Write a few words first." }, { status: 400 });
  if (email && !EMAIL.test(email)) return Response.json({ error: "That email address does not look right." }, { status: 400 });
  const over = await limited(request, "feedback");
  if (over) return over;
  try {
    await getPool().query("INSERT INTO feedback (message, email, page) VALUES ($1, $2, $3)", [message, email || null, page]);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Feedback save failed", error);
    return Response.json({ error: "It could not be sent. Please try again." }, { status: 500 });
  }
}
