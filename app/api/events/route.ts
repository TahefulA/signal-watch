import { toIsoDate } from "@/lib/dates";
import { fetchFedPath } from "@/lib/kalshi";
import { fedSnapshotBefore, saveFedSnapshot, tigerEnabled } from "@/lib/tiger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET: Kalshi's Fed rate path now, and the last snapshot before today to measure the move against. Today's is saved. */
export async function GET(): Promise<Response> {
  try {
    const today = toIsoDate(new Date());
    const path = await fetchFedPath();
    let previous = null;
    if (tigerEnabled()) {
      await saveFedSnapshot(today, path).catch(() => undefined);
      previous = await fedSnapshotBefore(today).catch(() => null);
    }
    return Response.json({ path, previous }, { headers: { "Cache-Control": "public, s-maxage=900" } });
  } catch (error) {
    console.error("Fed path failed", error);
    return Response.json({ error: "Kalshi's Fed markets could not be read." }, { status: 502 });
  }
}
