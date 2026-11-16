import { recordError } from "@/lib/errors";
import { limited } from "@/lib/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { message, stack?, path }: a crash in someone's browser, sent by components/error-reporter.tsx. */
export async function POST(request: Request): Promise<Response> {
  const over = await limited(request, "error");
  if (over) return new Response(null, { status: 204 });
  let body: { message?: unknown; stack?: unknown; path?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(null, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.slice(0, 1000) : "";
  if (!message) return new Response(null, { status: 400 });
  await recordError({
    source: "client",
    where: typeof body.path === "string" ? body.path.split("?")[0].slice(0, 200) : "unknown",
    message,
    stack: typeof body.stack === "string" ? body.stack.slice(0, 4000) : null,
  });
  return new Response(null, { status: 204 });
}
