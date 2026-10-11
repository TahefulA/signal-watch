import type { CaseTheme, DevilsAdvocate, PatternCategory, PatternResult, PeerComparison, Report } from "@/types";
import { parseDisplayMoney } from "./node-visuals";

/**
 * What the Devil's Advocate flags, read from a saved counter-argument. Every
 * item here comes from the argument's own citations or from a pattern that fired;
 * nothing is estimated.
 */

/** Boxes the counter-argument names or cites. */
export function flaggedIds(devil: DevilsAdvocate | null | undefined): Set<string> {
  const ids = new Set<string>();
  if (!devil) return ids;
  for (const c of devil.citations) if (c.entityId) ids.add(c.entityId);
  for (const s of devil.argument) if (s.entityId) ids.add(s.entityId);
  return ids;
}

/** One concern per strong or moderate section of the case; older counter-arguments count their sourced claims. */
export function concernCount(devil: DevilsAdvocate | null | undefined): number {
  if (devil?.sections) return devil.sections.filter((s) => s.strength !== "weak").length;
  return devil?.citations.length ?? 0;
}

export function firedPatterns(devil: DevilsAdvocate | null | undefined, categories: PatternCategory[], ids?: string[]): PatternResult[] {
  return (devil?.patterns ?? []).filter((p) => p.status === "fired" && (categories.includes(p.category) || ids?.includes(p.id)));
}

const STANCE_WORD: Record<string, string> = { STABLE: "Stable", CAUTION: "Caution", AT_RISK: "At risk", DISTRESSED: "Distressed" };

export function stanceWord(devil: DevilsAdvocate | null | undefined): string | null {
  return devil?.memoStance ? STANCE_WORD[devil.memoStance] : null;
}

/** For the comparison rows where a lower or higher figure is weaker credit, which way is weaker. */
const WEAKER: Record<string, "higher" | "lower"> = {
  "Total debt / EBITDA": "higher",
  "EBITDA / interest": "lower",
  "Cash + revolver availability": "lower",
  "Revenue concentration": "higher",
};

function valueOf(display: string): number | null {
  const multiple = display.match(/^(-?\d+(?:\.\d+)?)x$/);
  if (multiple) return Number(multiple[1]);
  const percent = display.match(/^(-?\d+(?:\.\d+)?)%$/);
  if (percent) return Number(percent[1]);
  return parseDisplayMoney(display);
}

/** Rows where the subject company is the weakest of the companies compared, with every company's figure. */
export function peerConcerns(comparison: PeerComparison | null): string[] {
  if (!comparison) return [];
  const subject = comparison.companies[0]?.ticker;
  const out: string[] = [];
  for (const row of comparison.metrics) {
    const way = WEAKER[row.label];
    if (!way || !subject) continue;
    const known = row.values.map((v) => ({ ...v, n: valueOf(v.display) })).filter((v): v is typeof v & { n: number } => v.n !== null);
    if (known.length < 2 || !known.some((v) => v.ticker === subject)) continue;
    const worst = known.reduce((a, b) => (way === "higher" ? (b.n > a.n ? b : a) : b.n < a.n ? b : a));
    if (worst.ticker !== subject) continue;
    const others = known
      .filter((v) => v.ticker !== subject)
      .map((v) => `${v.ticker} ${v.display}`)
      .join(", ");
    out.push(
      `${subject} has the ${way === "higher" ? "highest" : "lowest"} ${row.label.toLowerCase()} of the ${known.length} companies with a figure: ${worst.display} against ${others}.`,
    );
  }
  return out;
}

export interface CounterItemData {
  text: string;
  source: { label: string; url: string } | null;
  quote: string | null;
}

export function itemsFromPatterns(patterns: PatternResult[]): CounterItemData[] {
  return patterns.map((p) => ({
    text: `${p.name}. ${p.detail}`,
    source: p.evidence[0] ? { label: p.evidence[0].label, url: p.evidence[0].url } : null,
    quote: p.evidence[0]?.quote ?? null,
  }));
}

/** Debt patterns that fired, then the argument's claims that cite the capital structure. */
export function capitalItems(devil: DevilsAdvocate | null | undefined): CounterItemData[] {
  const cited = (devil?.citations ?? [])
    .filter((c) => !c.entityId && !c.patternId && c.source.endsWith("capital structure"))
    .map((c) => ({
      text: c.claim.charAt(0).toUpperCase() + c.claim.slice(1),
      source: c.url ? { label: c.source, url: c.url } : null,
      quote: c.quote,
    }));
  return [...itemsFromPatterns(firedPatterns(devil, ["debt"], ["off_balance_sheet", "restricted_cash"])), ...cited];
}

export const CHANGE_PATTERNS = [
  "new_risk_factor",
  "tone_shift",
  "insider_selling",
  "guidance_vs_selling",
  "departures",
  "auditor_change",
  "estimate_change",
];

/** Behavior and language patterns that fired, then new facts since the previous quarter that add risk: new debt and new high or medium severity boxes. */
export function changesItems(devil: DevilsAdvocate | null | undefined, report: Report): CounterItemData[] {
  const severity = new Map(report.graph.nodes.map((n) => [n.id, n.severity]));
  const worse = (report.changes?.changes ?? [])
    .filter(
      (c) =>
        !c.judgment &&
        (c.kind === "new_debt" || (c.kind === "new" && c.entityId && ["high", "medium"].includes(severity.get(c.entityId) ?? ""))),
    )
    .slice(0, 4)
    .map((c) => {
      const cite = c.citations.at(-1);
      return {
        text: `${c.name}: ${c.detail}`,
        source: cite ? { label: `${cite.sourceType} filed ${cite.sourceDate}`, url: cite.sourceUrl } : null,
        quote: cite?.quote ?? null,
      };
    });
  return [...itemsFromPatterns(firedPatterns(devil, [], CHANGE_PATTERNS)), ...worse];
}

/** The structured case's sections for these themes, each as its headline and plain-English explanation. */
export function sectionItems(devil: DevilsAdvocate | null | undefined, themes: CaseTheme[]): CounterItemData[] {
  return (devil?.sections ?? [])
    .filter((s) => themes.includes(s.theme))
    .map((s) => {
      const cite = s.citations.find((c) => c.url);
      return {
        text: `${s.headline}${s.plainEnglish ? ` ${s.plainEnglish}` : ""}`,
        source: cite?.url ? { label: cite.source, url: cite.url } : null,
        quote: null,
      };
    });
}
