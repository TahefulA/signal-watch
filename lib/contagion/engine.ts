import type { ContagionAssessment, ContagionCompany, ContagionEdge, ContagionFlag, ContagionRule, LmeEvent, Sponsor } from "@/types";
import { sameCompany } from "./match";

/**
 * The contagion engine. The graph links companies to their sponsors (from the
 * sponsor definition in their own credit documents) and to each other when
 * the same bank agents their credit agreements. From every company with a
 * bankruptcy or liability management deal, a breadth-first search walks two
 * company-to-company steps; then four stated rules decide each company's flag.
 * There are no weights: a rule fires or it does not, and the page says which.
 */

export const MAX_DEGREES = 2;
/** Principal due within two years of the balance sheet, as a share of total debt, that counts as a maturity wall. */
export const MATURITY_SHARE = 0.1;
/** Events older than this no longer say much about a sponsor's current playbook. */
export const HISTORY_YEARS = 10;
/** A sponsor definition in a document this old may describe an owner that has since sold out. */
export const OWNERSHIP_YEARS = 6;

/**
 * Keeps the sponsor links that still describe the owner: any link for a
 * company that stopped filing (its history is what matters), and for a live
 * company only links from documents filed in the last six years.
 */
export function currentOwners(companies: ContagionCompany[], today: string): ContagionCompany[] {
  const since = `${Number(today.slice(0, 4)) - OWNERSHIP_YEARS}${today.slice(4)}`;
  return companies
    .map((c) => (c.active ? { ...c, sponsors: c.sponsors.filter((s) => s.filed >= since) } : c))
    .filter((c) => c.sponsors.length > 0);
}

const FLAGGED_BANDS = new Set(["elevated", "high", "severe"]);

/** "JPMorgan Chase Bank, N.A." and "JPMORGAN CHASE BANK, N.A" are one agent. */
function agentKey(name: string): string {
  return name.toLowerCase().replace(/\b(n\.?a\.?|plc|ag|llc|inc|branch|new york|ny)\b/g, " ").replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
}

export function buildEdges(companies: ContagionCompany[]): ContagionEdge[] {
  const edges: ContagionEdge[] = [];
  for (const c of companies) {
    for (const s of c.sponsors) edges.push({ id: `s:${s.sponsorId}:${c.cik}`, kind: "sponsor", source: s.sponsorId, target: c.cik, label: "Sponsor" });
  }
  const withAgent = companies.filter((c) => c.agent);
  for (let i = 0; i < withAgent.length; i++) {
    for (let j = i + 1; j < withAgent.length; j++) {
      const a = withAgent[i];
      const b = withAgent[j];
      const ka = agentKey(a.agent?.name ?? "");
      const kb = agentKey(b.agent?.name ?? "");
      if (ka && kb && (ka === kb || sameCompany(ka, kb))) edges.push({ id: `l:${a.cik}:${b.cik}`, kind: "lender", source: a.cik, target: b.cik, label: a.agent?.name ?? "" });
    }
  }
  return edges;
}

interface Step {
  cik: string;
  via: "sponsor" | "lender";
  label: string;
}

/** Company-to-company neighbours: siblings under one sponsor, and companies with the same agent bank. */
function neighbours(companies: ContagionCompany[], edges: ContagionEdge[], sponsors: Sponsor[]): Map<string, Step[]> {
  const out = new Map<string, Step[]>(companies.map((c) => [c.cik, []]));
  const name = (id: string) => sponsors.find((s) => s.id === id)?.name ?? id;
  const bySponsor = new Map<string, string[]>();
  for (const e of edges.filter((x) => x.kind === "sponsor")) bySponsor.set(e.source, [...(bySponsor.get(e.source) ?? []), e.target]);
  for (const [sponsor, ciks] of bySponsor) {
    for (const a of ciks) for (const b of ciks) if (a !== b) out.get(a)?.push({ cik: b, via: "sponsor", label: `same sponsor (${name(sponsor)})` });
  }
  for (const e of edges.filter((x) => x.kind === "lender")) {
    out.get(e.source)?.push({ cik: e.target, via: "lender", label: `same agent bank (${e.label})` });
    out.get(e.target)?.push({ cik: e.source, via: "lender", label: `same agent bank (${e.label})` });
  }
  return out;
}

interface Reach {
  degrees: number;
  path: string[];
  /** True when the first step from the event company was through a shared sponsor. */
  bySponsor: boolean;
}

/** Breadth-first search from one company, two steps out. */
export function reachFrom(start: string, adj: Map<string, Step[]>, maxDegrees = MAX_DEGREES): Map<string, Reach> {
  const seen = new Map<string, Reach>([[start, { degrees: 0, path: [], bySponsor: false }]]);
  let frontier = [start];
  for (let d = 1; d <= maxDegrees; d++) {
    const next: string[] = [];
    for (const cik of frontier) {
      const from = seen.get(cik) as Reach;
      for (const step of adj.get(cik) ?? []) {
        if (seen.has(step.cik)) continue;
        seen.set(step.cik, { degrees: d, path: [...from.path, step.label], bySponsor: d === 1 ? step.via === "sponsor" : from.bySponsor });
        next.push(step.cik);
      }
    }
    frontier = next;
  }
  seen.delete(start);
  return seen;
}

const money = (v: number) => (Math.abs(v) >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${Math.round(v / 1e6)}M`);
const KIND_LABEL: Record<LmeEvent["kind"], string> = { bankruptcy: "bankruptcy filing", restructuring: "restructuring support agreement", lme: "liability management deal" };

function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function assess(companies: ContagionCompany[], edges: ContagionEdge[], sponsors: Sponsor[], today: string): ContagionAssessment[] {
  const adj = neighbours(companies, edges, sponsors);
  const since = `${Number(today.slice(0, 4)) - HISTORY_YEARS}${today.slice(4)}`;
  const byCik = new Map(companies.map((c) => [c.cik, c]));
  const reached = new Map<string, { cik: string; event: LmeEvent; reach: Reach }[]>();
  for (const source of companies) {
    const events = source.events.filter((e) => e.date >= since && e.date <= today);
    if (!events.length) continue;
    for (const [cik, reach] of reachFrom(source.cik, adj)) {
      for (const event of events) reached.set(cik, [...(reached.get(cik) ?? []), { cik: source.cik, event, reach }]);
    }
  }

  return companies.map((c) => {
    const found = (reached.get(c.cik) ?? []).sort((a, b) => a.reach.degrees - b.reach.degrees || b.event.date.localeCompare(a.event.date));
    const sibling = found.find((f) => f.reach.degrees === 1 && f.reach.bySponsor);
    const nearest = sibling ?? found[0] ?? null;
    const rules: ContagionRule[] = [];

    rules.push(
      sibling
        ? { key: "sponsor_history", fired: true, text: `${byCik.get(sibling.cik)?.name} (${sibling.reach.path[0]}) had a ${KIND_LABEL[sibling.event.kind]} on ${sibling.event.date}`, url: sibling.event.url }
        : { key: "sponsor_history", fired: false, text: found.length ? `No sibling under the same sponsor has an event; the nearest is ${found[0].reach.degrees} steps away` : "No company under the same sponsor has an event on EDGAR" },
    );

    const risky = (c.lme?.verdicts ?? []).filter((v) => v.risk === "high" || v.risk === "medium");
    rules.push(
      c.lme === undefined
        ? { key: "trapdoor_open", fired: false, text: "Credit documents not scanned yet" }
        : c.lme === null
          ? { key: "trapdoor_open", fired: false, text: "No indenture or credit agreement found on EDGAR" }
          : risky.length
            ? { key: "trapdoor_open", fired: true, text: `${risky.length} trapdoor${risky.length === 1 ? "" : "s"} open in the credit documents (${risky.map((r) => r.trapdoor).join(", ")})`, url: c.lme.open[0]?.url }
            : { key: "trapdoor_open", fired: false, text: "Every trapdoor found was blocked, or none was found" },
    );

    let window: string | null = null;
    const dueTotal = (c.due?.next12 ?? 0) + (c.due?.year2 ?? 0);
    if (c.due && c.debt && dueTotal >= MATURITY_SHARE * c.debt.value) {
      const near = (c.due.next12 ?? 0) >= MATURITY_SHARE * c.debt.value;
      window = addMonths(c.due.asOf, near ? 12 : 24);
      rules.push({ key: "maturity", fired: true, text: `${money(dueTotal)} of principal due by ${window}, ${Math.round((dueTotal / c.debt.value) * 100)}% of ${money(c.debt.value)} debt`, url: c.due.url });
    } else {
      rules.push({ key: "maturity", fired: false, text: c.due ? `Under ${MATURITY_SHARE * 100}% of debt due in the two years after ${c.due.asOf}` : "No maturity schedule tagged in the latest filings" });
    }

    rules.push(
      c.distress && FLAGGED_BANDS.has(c.distress.band)
        ? { key: "distress", fired: true, text: `Bankruptcy probability ${(c.distress.probability * 100).toFixed(1)}% within 12 months (${c.distress.band})` }
        : { key: "distress", fired: false, text: c.distress ? `Bankruptcy probability ${(c.distress.probability * 100).toFixed(1)}% (low)` : "No recent balance sheet to score" },
    );

    const fired = rules.filter((r) => r.fired).length;
    const history = rules[0].fired;
    const flag: ContagionFlag = !c.active ? "history" : fired === 4 ? "target" : (history && fired >= 2) || fired >= 3 ? "watch" : "clear";
    return {
      cik: c.cik,
      flag,
      rules,
      trigger: nearest ? { cik: nearest.cik, name: byCik.get(nearest.cik)?.name ?? nearest.cik, event: nearest.event, path: nearest.reach.path, degrees: nearest.reach.degrees } : null,
      reachable: found.slice(0, 12).map((f) => ({ cik: f.cik, eventId: f.event.id, degrees: f.reach.degrees })),
      window,
    };
  });
}
