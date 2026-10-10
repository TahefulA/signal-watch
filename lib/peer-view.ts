import type { Entity, PeerComparison, Report } from "@/types";

export interface PeerContext {
  exposure: string;
  norm: string;
  differentiation: string;
}

/** What the loaded peer comparison says about one entity on the subject's map. */
export function peerContextFor(entity: Entity, comparison: PeerComparison, peers: Report[]): PeerContext {
  const subject = comparison.companies[0]?.ticker ?? "";
  const peerTickers = comparison.companies.slice(1).map((c) => c.ticker);
  const group = comparison.shared.find((s) => s.members.some((m) => m.ticker === subject && m.entityId === entity.id));
  const others = group?.members.filter((m) => m.ticker !== subject) ?? [];
  const descriptive = entity.type === "risk" || entity.type === "macro";

  const exposure =
    others.length > 0
      ? others.map((m) => (m.mapped ? `${m.ticker}: on its map as “${m.relationship}”` : `${m.ticker}: named in its filings`)).join("; ")
      : descriptive
        ? `No similar risk on ${peerTickers.join(", ")}'s maps`
        : `Not named in ${peerTickers.join(", ")}'s filings read`;

  let norm = "Not comparable";
  if (entity.relationType) {
    const label = entity.relationType.replace(/_/g, " ");
    const count = peers.filter((p) => p.graph.nodes.some((n) => !n.isCentral && n.relationType === entity.relationType)).length;
    norm = `${count} of ${peers.length} ${peers.length === 1 ? "peer maps" : "peers map"} a ${label} relationship`;
  }

  const differentiation =
    others.length > 0
      ? `Shared with ${others.map((m) => m.ticker).join(", ")}`
      : `Specific to ${subject} among the companies compared`;

  return { exposure, norm, differentiation };
}
