import type { Report } from "@/types";
import { comparePeers } from "@/lib/peers";
import { findReportById, savePeerComparison, tigerEnabled } from "@/lib/tiger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST { reportId, peerReportIds } and receive { comparison, peers } built from the saved reports. */
export async function POST(request: Request): Promise<Response> {
  let body: { reportId?: unknown; peerReportIds?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const reportId = typeof body.reportId === "string" ? body.reportId : "";
  const peerIds = Array.isArray(body.peerReportIds) ? body.peerReportIds.filter((v): v is string => typeof v === "string").slice(0, 3) : [];
  if (!tigerEnabled()) return Response.json({ error: "Peer comparison needs saved reports, and storage is not configured." }, { status: 503 });

  try {
    const [subject, ...peers] = await Promise.all([reportId, ...peerIds].map((id) => findReportById(id)));
    const found = peers.filter((p): p is Report => p !== null && p.graph.company.ticker !== subject?.graph.company.ticker);
    if (!subject || found.length === 0) {
      return Response.json({ error: "Those reports are no longer available. Run the analysis again." }, { status: 404 });
    }
    const comparison = await comparePeers(subject, found);
    await savePeerComparison(comparison).catch((error: unknown) => console.error("Saving peer comparison failed", error));
    return Response.json({ comparison, peers: found });
  } catch (error) {
    console.error("Peer comparison failed", error);
    return Response.json({ error: "The comparison could not be built. Please try again." }, { status: 500 });
  }
}
