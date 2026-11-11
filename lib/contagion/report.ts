import type { Report, SponsorContext } from "@/types";
import { loadContagion } from "./store";

/**
 * The sponsor graph's view of one borrower, for the committee and the radar:
 * who owns it per its credit documents, and the nearest sibling event.
 * Null when the borrower is not a sponsor-backed SEC filer in the graph.
 */
export async function sponsorContext(cik: string): Promise<SponsorContext | null> {
  const map = await loadContagion().catch(() => null);
  const key = String(Number(cik));
  const c = map?.companies.find((x) => x.cik === key);
  const a = map?.assessments.find((x) => x.cik === key);
  if (!map || !c || !a) return null;
  const sibling = a.trigger && a.trigger.degrees === 1 && a.rules[0].fired ? a.trigger : null;
  return {
    sponsors: c.sponsors.map((s) => map.sponsors.find((x) => x.id === s.sponsorId)?.name ?? s.sponsorId),
    definition: c.sponsors[0].quote,
    documentUrl: c.sponsors[0].documentUrl,
    flag: a.flag,
    fired: a.rules.filter((r) => r.fired).map((r) => r.text),
    siblings: map.companies.filter((x) => x.cik !== key && x.sponsors.some((s) => c.sponsors.some((t) => t.sponsorId === s.sponsorId))).length,
    trigger: sibling ? { name: sibling.name, date: sibling.event.date, kind: sibling.event.kind, term: sibling.event.term, quote: sibling.event.quote, url: sibling.event.url } : null,
    builtAt: map.builtAt,
  };
}

/** Adds or refreshes the sponsor view on a report; changed when it differs from the saved one. */
export async function ensureSponsor(report: Report): Promise<{ report: Report; changed: boolean }> {
  const sponsor = await sponsorContext(report.graph.company.cik).catch(() => undefined);
  if (sponsor === undefined || JSON.stringify(sponsor) === JSON.stringify(report.sponsor ?? null)) return { report, changed: false };
  return { report: { ...report, sponsor }, changed: true };
}
