import { randomUUID } from "node:crypto";
import type { Citation, Divergence, Entity, PeerComparison, PeerMember, PeerMetricRow, Report, SharedEntity } from "@/types";
import { money } from "./capital";
import { type FilingDoc, findMention, loadFilingDocs, sameEntity } from "./changes";

/**
 * Peer comparison built only from the saved reports: no outside knowledge and
 * no model calls. Named entities match by entity resolution; risks, whose names
 * Gemini writes, match by theme and always show both companies' quotes.
 */

const THEMES: { label: string; pattern: RegExp }[] = [
  { label: "Power availability and cost", pattern: /\b(power|electric|energy|utility|grid|interconnect)/i },
  { label: "Construction and supply chain", pattern: /\b(construction|supply chain|equipment|build|contractor)/i },
  { label: "Customer and tenant concentration", pattern: /\b(concentration|tenant|customer|counterparty)/i },
  { label: "Financing and liquidity", pattern: /\b(financing|liquidity|refinanc|capital markets|indebtedness|leverage)/i },
  { label: "Permitting and approvals", pattern: /\b(permit|moratorium|zoning|executive order|approval|public service commission|public utility commission|community opposition)/i },
  { label: "Bitcoin price and mining economics", pattern: /\b(bitcoin|hashprice|mining|halving|digital asset)/i },
  { label: "Interest rates", pattern: /\b(interest rate|rates)\b/i },
  { label: "Tariffs and trade", pattern: /\b(tariff|trade)/i },
  { label: "Cybersecurity", pattern: /\bcyber/i },
  { label: "Litigation", pattern: /\b(litigation|lawsuit|legal proceeding)/i },
];

function citationOf(e: Entity): Citation {
  return { quote: e.sourceQuote, sourceType: e.sourceType, sourceDate: e.sourceDate, sourceUrl: e.sourceUrl, sourceLabel: e.sourceLabel, page: e.sourcePage ?? null };
}

function member(report: Report, e: Entity): PeerMember {
  return {
    ticker: report.graph.company.ticker,
    entityId: e.id,
    mapped: true,
    name: e.name,
    relationship: e.relationship,
    relationType: e.relationType,
    citation: citationOf(e),
  };
}

/**
 * Entities that can be matched across companies. Debt and other financial items are
 * company-specific ("Senior Secured Notes due 2030" at two companies are different
 * bonds), so they are compared in the metrics instead.
 */
function entities(report: Report): Entity[] {
  return report.graph.nodes.filter((n) => !n.isCentral && n.change?.kind !== "removed" && !n.id.startsWith("debt-") && n.type !== "financial");
}

function isDescriptive(e: Entity): boolean {
  return e.type === "risk" || e.type === "macro";
}

function metric(report: Report, key: string): string {
  return report.capital?.metrics.find((m) => m.key === key)?.display ?? "Not available";
}

function metricNote(report: Report, key: string): string | undefined {
  return report.capital?.metrics.find((m) => m.key === key)?.note;
}

function earliestMaturity(report: Report): string | null {
  const dates = (report.capital?.instruments ?? []).map((i) => i.maturity).filter((d): d is string => d !== null).sort();
  return dates[0] ?? null;
}

function ebitda(report: Report): number | null {
  const operating = report.capital?.financials.find((f) => f.concept === "OperatingIncomeLoss");
  const depreciation = report.capital?.financials.find((f) => /Depreciation/.test(f.concept));
  return operating && depreciation ? operating.value + depreciation.value : null;
}

function securedShare(report: Report): number | null {
  const v = metric(report, "secured_share");
  return /^\d+%$/.test(v) ? Number(v.replace("%", "")) : null;
}

/** The largest revenue share any box discloses as a percentage, or null. */
function revenueConcentration(report: Report): { display: string; note: string } | null {
  const shares = entities(report)
    .filter((e) => e.magnitude?.kind === "revenue" && /%/.test(e.magnitude.label))
    .map((e) => ({ e, value: Number((e.magnitude?.label.match(/(\d+(?:\.\d+)?)\s*%/) ?? [])[1]) }))
    .filter((x) => Number.isFinite(x.value))
    .sort((a, b) => b.value - a.value);
  const top = shares[0];
  return top ? { display: `${top.value}%`, note: `${top.e.name}: ${top.e.magnitude?.label}` } : null;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function metricRows(reports: Report[]): PeerMetricRow[] {
  const row = (label: string, value: (r: Report) => { display: string; note?: string }): PeerMetricRow => ({
    label,
    values: reports.map((r) => ({ ticker: r.graph.company.ticker, ...value(r) })),
  });
  return [
    row("Total debt", (r) => ({ display: metric(r, "total_debt"), note: metricNote(r, "total_debt") })),
    row("Net debt", (r) => ({ display: metric(r, "net_debt") })),
    row("EBITDA, last 12 months", (r) => ({ display: metric(r, "ebitda") })),
    row("Total debt / EBITDA", (r) => ({ display: metric(r, "debt_to_ebitda") })),
    row("EBITDA / interest", (r) => ({ display: metric(r, "interest_coverage") })),
    row("Secured / total debt", (r) => ({ display: metric(r, "secured_share") })),
    row("Cash + revolver availability", (r) => ({ display: metric(r, "liquidity") })),
    row("Earliest debt maturity", (r) => ({ display: earliestMaturity(r) ?? "Not disclosed" })),
    row("Revenue concentration", (r) => revenueConcentration(r) ?? { display: "Not disclosed", note: "No box states a share of revenue." }),
    row("Market capitalization", (r) => ({ display: r.market?.marketCap ? money(r.market.marketCap) : "Not available" })),
    row("90-day price change", (r) => ({ display: r.market ? percent(r.market.return90d) : "Not available" })),
  ];
}

function divergences(subject: Report, peer: Report, shared: SharedEntity[]): Divergence[] {
  const a = subject.graph.company.ticker;
  const b = peer.graph.company.ticker;
  const out: Divergence[] = [];

  // A guarantor counts as a divergence only if the other company's filings never name it.
  const sharedWith = (e: Entity, ticker: string) =>
    shared.some((s) => s.members.some((m) => m.entityId === e.id) && s.members.some((m) => m.ticker === ticker));
  const guarantors = (r: Report, other: string) =>
    entities(r).filter((e) => e.relationType === "GUARANTEES" && !sharedWith(e, other));
  const ga = guarantors(subject, b);
  const gb = guarantors(peer, a);
  const anyGuarantor = (r: Report) => entities(r).some((e) => e.relationType === "GUARANTEES");
  if (ga.length > 0 && !anyGuarantor(peer)) {
    out.push({ text: `${a} discloses credit support from ${ga.map((g) => g.name).join(", ")}; ${b}'s filings read never name ${ga.length > 1 ? "them" : "it"}.`, tickers: [a, b] });
  }
  if (gb.length > 0 && !anyGuarantor(subject)) {
    out.push({ text: `${b} discloses credit support from ${gb.map((g) => g.name).join(", ")}; ${a}'s filings read never name ${gb.length > 1 ? "them" : "it"}.`, tickers: [a, b] });
  }

  const ea = ebitda(subject);
  const eb = ebitda(peer);
  if (ea !== null && eb !== null && Math.sign(ea) !== Math.sign(eb)) {
    const [pos, neg] = ea > 0 ? [a, b] : [b, a];
    out.push({ text: `${pos} has positive last-12-month EBITDA; ${neg}'s is negative, so its leverage ratios are not meaningful.`, tickers: [a, b] });
  }

  const sa = securedShare(subject);
  const sb = securedShare(peer);
  if (sa !== null && sb !== null && Math.abs(sa - sb) >= 25) {
    const [more, less] = sa > sb ? [a, b] : [b, a];
    out.push({ text: `${more}'s debt is mostly secured (${Math.max(sa, sb)}%) against ${Math.min(sa, sb)}% for ${less}.`, tickers: [a, b] });
  }

  const ma = earliestMaturity(subject);
  const mb = earliestMaturity(peer);
  if (ma && mb && Math.abs(Number(ma.slice(0, 4)) - Number(mb.slice(0, 4))) >= 2) {
    const [sooner, later] = ma < mb ? [[a, ma], [b, mb]] : [[b, mb], [a, ma]];
    out.push({ text: `${sooner[0]}'s first debt maturity is ${sooner[1]}, against ${later[1]} for ${later[0]}.`, tickers: [a, b] });
  }
  return out;
}

/**
 * Compares a subject report with one or more peer reports. A named entity on one
 * map that is missing from another is looked up in that company's filing text,
 * so "unique" means not mentioned, not merely not extracted.
 */
export async function comparePeers(subject: Report, peers: Report[]): Promise<PeerComparison> {
  const reports = [subject, ...peers];
  const texts = new Map<string, FilingDoc[]>();
  await Promise.all(
    reports.map(async (r) => texts.set(r.graph.company.ticker, await loadFilingDocs(r.graph.company.cik, r.sources).catch(() => []))),
  );
  const shared: SharedEntity[] = [];
  const matched = new Map<string, Set<string>>(reports.map((r) => [r.graph.company.ticker, new Set<string>()]));
  const mark = (r: Report, id: string) => matched.get(r.graph.company.ticker)?.add(id);

  // Named entities: the same counterparty, lender or regulator for two companies.
  for (const owner of reports) {
    for (const e of entities(owner).filter((x) => !isDescriptive(x))) {
      if (matched.get(owner.graph.company.ticker)?.has(e.id)) continue;
      const members: PeerMember[] = [member(owner, e)];
      for (const other of reports) {
        if (other === owner) continue;
        const match = entities(other).find((p) => !isDescriptive(p) && sameEntity(p.name, e.name));
        if (match) {
          members.push(member(other, match));
          mark(other, match.id);
          continue;
        }
        const mention = findMention(texts.get(other.graph.company.ticker) ?? [], e.name);
        if (mention) {
          members.push({ ticker: other.graph.company.ticker, entityId: "", mapped: false, name: e.name, relationship: "Named in filings", citation: mention });
        }
      }
      // Only comparisons that involve the subject company are shown.
      if (members.length > 1 && members.some((m) => m.ticker === subject.graph.company.ticker)) {
        mark(owner, e.id);
        shared.push({ kind: "named", label: e.name, members });
      }
    }
  }

  // Risk themes: similar disclosures, matched by subject matter.
  for (const theme of THEMES) {
    const members: PeerMember[] = [];
    for (const r of reports) {
      // Risks first, so a regulator only stands in for a theme when no risk box covers it.
      const hit = [...entities(r)].sort((x, y) => Number(isDescriptive(y)) - Number(isDescriptive(x))).find(
        (e) => (isDescriptive(e) || e.type === "regulatory") && !matched.get(r.graph.company.ticker)?.has(e.id) && theme.pattern.test(`${e.name} ${e.relationship}`),
      );
      if (hit) members.push(member(r, hit));
    }
    if (members.length > 1 && members.some((m) => m.ticker === subject.graph.company.ticker)) {
      for (const m of members) matched.get(m.ticker)?.add(m.entityId);
      shared.push({ kind: "theme", label: theme.label, members });
    }
  }

  const unique: Record<string, string[]> = {};
  for (const r of reports) {
    const seen = matched.get(r.graph.company.ticker) ?? new Set<string>();
    unique[r.graph.company.ticker] = entities(r)
      .filter((e) => !seen.has(e.id))
      .map((e) => e.id);
  }

  return {
    id: randomUUID(),
    companies: reports.map((r) => ({ reportId: r.id, ticker: r.graph.company.ticker, name: r.graph.company.name })),
    shared,
    unique,
    metrics: metricRows(reports),
    divergences: peers.flatMap((p) => divergences(subject, p, shared)),
    createdAt: new Date().toISOString(),
  };
}
