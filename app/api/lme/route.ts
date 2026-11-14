import { limited } from "@/lib/visitor";
import { ensureLme } from "@/lib/lme-report";
import { findReportById, tigerEnabled, updateReport } from "@/lib/tiger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST { reportId } and receive { lme }: the borrower's credit documents read for J.Crew, Chewy and Serta trapdoors. */
export async function POST(request: Request): Promise<Response> {
  let body: { reportId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  if (!tigerEnabled()) return Response.json({ error: "The scan needs saved reports, and storage is not configured." }, { status: 503 });
  const over = await limited(request, "lme");
  if (over) return over;
  const report = await findReportById(typeof body.reportId === "string" ? body.reportId : "").catch(() => null);
  if (!report) return Response.json({ error: "This report is no longer available. Run the analysis again." }, { status: 404 });
  const { report: next, changed } = await ensureLme(report);
  if (changed) await updateReport(next).catch((error: unknown) => console.error("Saving the scan failed", error));
  if (next.lme === undefined) return Response.json({ error: "The credit documents could not be read. Please try again." }, { status: 502 });
  return Response.json({ lme: next.lme });
}
