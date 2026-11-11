import { ownerView } from "@/lib/contagion/owner";
import { findReportById, tigerEnabled } from "@/lib/tiger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** GET ?cik=&ticker=&report=: one borrower read through its owner. A company outside the last build is read from EDGAR now. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const cik = params.get("cik");
  if (!cik || !/^\d{1,10}$/.test(cik)) return Response.json({ error: "cik is required" }, { status: 400 });
  const reportId = params.get("report");
  const report = reportId && tigerEnabled() ? await findReportById(reportId).catch(() => null) : null;
  try {
    const view = await ownerView(cik, params.get("ticker"), report ? report.lme : undefined);
    if (!view) return Response.json({ error: "The contagion graph has not been built" }, { status: 404 });
    return Response.json(view);
  } catch (error) {
    return Response.json({ error: `Could not read the owner: ${String(error)}` }, { status: 502 });
  }
}
