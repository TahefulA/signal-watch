import type { CapitalMetric, DistressReason, EvidenceCard, PatternResult, Report, Strength } from "@/types";
import { money } from "../capital";
import { TRAPDOOR_LABELS, TRAPDOOR_MOVES } from "../lme-scanner";

/**
 * The two piles of evidence the committee argues from. Every card is written
 * here, in code, from the checked report: fired checks, the distress model,
 * the filing change score, the rate stress, the credit metrics and the
 * entities on the map with their quotes. The agents choose cards by id; they
 * never write a quote or a figure that is not on a card.
 */

const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;

function multiple(m: CapitalMetric | undefined): number | null {
  const match = m?.display.match(/^(-?\d+(?:\.\d+)?)x$/);
  return match ? Number(match[1]) : null;
}

function reasonText(reasons: DistressReason[]): string {
  return reasons.map((r) => `${r.label.toLowerCase()} ${r.display}`).join("; ");
}

/** Strength of a fired check, from the written case when it argued from that check. */
function patternStrength(report: Report, id: string): Strength {
  for (const s of report.devil?.sections ?? []) if (s.citations.some((c) => c.patternId === id)) return s.strength;
  return "moderate";
}

/** Patterns default to the ones saved with the written case; a caller without one passes freshly run checks. */
export function buildCards(report: Report, patterns: PatternResult[] = report.devil?.patterns ?? []): EvidenceCard[] {
  const cards: EvidenceCard[] = [];
  const company = report.graph.company;
  const d = report.distress;

  // ---- the forecast itself
  if (d) {
    const multipleOfBase = d.probability / d.baseRate;
    const head = `The distress model puts ${company.ticker}'s probability of a bankruptcy filing within 12 months at ${pct(d.probability)}, against an average of ${pct(d.baseRate)} across the companies it was trained on`;
    const src = { label: `Distress model ${d.modelVersion}, figures filed before ${d.asOf}`, url: "/proof" };
    if (d.band !== "low" && d.reasons.length) {
      cards.push({
        id: "d:distress",
        side: "devil",
        kind: "distress",
        title: `${pct(d.probability)} chance of bankruptcy in 12 months`,
        detail: `${head}. What pushes it up most: ${reasonText(d.reasons)}.`,
        quote: null,
        source: src,
        strength: d.band === "elevated" ? "moderate" : "strong",
      });
    }
    if (d.offsets.length) {
      cards.push({
        id: "a:distress",
        side: "analyst",
        kind: "distress",
        title: d.band === "low" ? `Only ${pct(d.probability)} chance of bankruptcy in 12 months` : `What holds the probability down`,
        detail:
          d.band === "low"
            ? `${head}. What holds it down most: ${reasonText(d.offsets)}.`
            : `The figures that hold ${company.ticker}'s ${pct(d.probability)} probability down: ${reasonText(d.offsets)}.`,
        quote: null,
        source: src,
        strength: d.band === "low" ? "strong" : multipleOfBase < 3 ? "moderate" : "weak",
      });
    }
    if (d.zScore !== null) {
      const z = d.zScore.toFixed(2);
      const card: EvidenceCard = {
        id: d.zZone === "distress" ? "d:altman" : "a:altman",
        side: d.zZone === "distress" ? "devil" : "analyst",
        kind: "distress",
        title: `Altman Z'' of ${z} (${d.zZone} zone)`,
        detail: `Altman's Z'' score on the same filed figures is ${z}; below 1.1 is the published distress zone and above 2.6 the safe zone.`,
        quote: null,
        source: { label: `Altman Z'' (1995), balance sheet of ${d.periodEnd}`, url: "/proof" },
        strength: d.zZone === "grey" ? "weak" : "moderate",
      };
      if (d.zZone !== "grey") cards.push(card);
    }
  }

  // ---- the contradiction checks
  for (const p of patterns) {
    if (p.status === "not_evaluated") continue;
    const ev = p.evidence[0];
    const fired = p.status === "fired";
    if (!fired && p.category !== "debt" && p.category !== "financial") continue;
    cards.push({
      id: `${fired ? "d" : "a"}:pattern:${p.id}`,
      side: fired ? "devil" : "analyst",
      kind: "pattern",
      title: fired ? p.name : `${p.name}: clear`,
      detail: p.detail,
      quote: ev?.quote ?? null,
      source: ev ? { label: ev.label, url: ev.url } : { label: "Signal Watch checks", url: null },
      strength: fired ? patternStrength(report, p.id) : "weak",
    });
  }

  // ---- what the filing rewrote
  const fc = report.filingChange;
  if (fc) {
    const key = fc.sections.filter((s) => /Risk Factors|Legal|Debt/i.test(s.section)).sort((a, b) => a.similarity - b.similarity);
    const worst = key[0];
    if (fc.flagged && worst) {
      cards.push({
        id: "d:filing_change",
        side: "devil",
        kind: "filing_change",
        title: `${worst.section} rewritten (similarity ${worst.similarity.toFixed(2)})`,
        detail: `The ${worst.section.toLowerCase()} in the ${fc.current.form} filed ${fc.current.filed} has a similarity of ${worst.similarity.toFixed(2)} to the same section of the ${fc.prior.form} filed ${fc.prior.filed}, below the ${fc.threshold.toFixed(2)} threshold; ${worst.added.length} new sentences and ${worst.removed.length} dropped ones are listed.`,
        quote: worst.added[0] ?? null,
        source: { label: `${fc.current.form} filed ${fc.current.filed}`, url: fc.current.url },
        strength: "moderate",
      });
    } else if (worst) {
      cards.push({
        id: "a:filing_change",
        side: "analyst",
        kind: "filing_change",
        title: "Key disclosures barely changed",
        detail: `The risk factor, legal and debt sections of the ${fc.current.form} filed ${fc.current.filed} are close to the ${fc.prior.form} filed ${fc.prior.filed}: the lowest similarity is ${worst.similarity.toFixed(2)} (${worst.section.toLowerCase()}), above the ${fc.threshold.toFixed(2)} threshold.`,
        quote: null,
        source: { label: `${fc.current.form} filed ${fc.current.filed}`, url: fc.current.url },
        strength: "weak",
      });
    }
  }

  // ---- the rate path from Kalshi
  const rs = report.rateStress;
  const hold = rs?.scenarios.find((s) => s.key === "hold");
  const market = rs?.scenarios.find((s) => s.key === "market");
  const stress = rs?.scenarios.find((s) => s.key === "stress");
  if (rs?.meeting && hold && market && stress && rs.currentUpper !== null) {
    const src = { label: `Kalshi Fed markets, ${rs.meeting.event}, read ${rs.fetchedAt.slice(0, 10)}`, url: rs.meeting.url };
    const odds = `Kalshi prices a ${pct(rs.meeting.pHike, 0)} chance the federal funds upper bound is above ${rs.currentUpper.toFixed(2)}% after the ${rs.meeting.date} meeting, with an expected ${rs.meeting.expectedUpper.toFixed(2)}% and a 90th percentile of ${rs.meeting.stressUpper.toFixed(2)}%`;
    if (rs.floatingDebt > 0) {
      const earlier = stress.runsOutAt && (!hold.runsOutAt || stress.runsOutAt < hold.runsOutAt);
      cards.push({
        id: "d:rates",
        side: "devil",
        kind: "rate",
        title: "Rate path raises interest on floating debt",
        detail: `${odds}. On ${money(rs.floatingDebt)} of floating-rate debt, the 90th percentile adds ${money(stress.extraInterest)} of interest a year; in the base cash case, cash ${stress.runsOutAt ? `runs out in the quarter ending ${stress.runsOutAt}` : "does not run out within the forecast"}${hold.runsOutAt ? ` against ${hold.runsOutAt} if rates hold` : ""}.`,
        quote: null,
        source: src,
        strength: earlier ? "strong" : stress.extraInterest > 0 ? "moderate" : "weak",
      });
    } else {
      cards.push({
        id: "a:rates",
        side: "analyst",
        kind: "rate",
        title: "No floating-rate debt",
        detail: `${odds}. No instrument in the debt note names a floating rate, so that path does not change ${company.ticker}'s interest cost.`,
        quote: null,
        source: src,
        strength: "moderate",
      });
    }
  }

  // ---- the credit documents: trapdoors left open for the devil, blockers for the analyst
  if (report.lme) {
    const verdict = new Map(report.lme.verdicts.map((v) => [v.trapdoor, v]));
    report.lme.clauses
      .filter((c) => c.verified && c.quote)
      .forEach((c, i) => {
        const doc = report.lme?.documents.find((x) => x.url === c.documentUrl);
        const open = c.status === "door_open";
        const name = TRAPDOOR_LABELS[c.trapdoor];
        cards.push({
          id: `${open ? "d" : "a"}:lme:${c.trapdoor}:${i}`,
          side: open ? "devil" : "analyst",
          kind: "lme",
          title: `${name} ${open ? "trapdoor open" : "blocker"}${c.section ? `, ${c.section}` : ""}`,
          detail: `${doc?.title ?? "Credit document"}${c.section ? `, ${c.section}` : ""}: ${c.why} (${name}: ${TRAPDOOR_MOVES[c.trapdoor].toLowerCase()}.)`,
          quote: c.quote,
          source: { label: `${doc ? `${doc.exhibit} filed ${doc.filed}` : "Credit document"}${c.section ? `, ${c.section}` : ""}`, url: c.documentUrl },
          strength: open && verdict.get(c.trapdoor)?.risk === "high" ? "strong" : "moderate",
        });
      });
  }

  // ---- the credit metrics
  const metric = (key: CapitalMetric["key"]) => report.capital?.metrics.find((m) => m.key === key);
  const capSrc = report.capital ? { label: `${report.capital.sourceType} ${report.capital.fiscalPeriod ?? report.capital.sourceDate}, debt note and XBRL`, url: report.capital.sourceUrl ?? null } : null;
  const lev = metric("debt_to_ebitda");
  const levX = multiple(lev);
  if (lev && levX !== null && capSrc) {
    if (levX >= 5 || levX < 0)
      cards.push({ id: "d:metric:leverage", side: "devil", kind: "metric", title: `Leverage of ${lev.display}`, detail: `Total debt is ${lev.display} EBITDA over the last 12 months.`, quote: null, source: capSrc, strength: levX >= 6 || levX < 0 ? "strong" : "moderate" });
    else if (levX <= 3)
      cards.push({ id: "a:metric:leverage", side: "analyst", kind: "metric", title: `Leverage of ${lev.display}`, detail: `Total debt is ${lev.display} EBITDA over the last 12 months.`, quote: null, source: capSrc, strength: levX <= 2 ? "strong" : "moderate" });
  }
  const cov = metric("interest_coverage");
  const covX = multiple(cov);
  if (cov && covX !== null && capSrc) {
    if (covX < 2)
      cards.push({ id: "d:metric:coverage", side: "devil", kind: "metric", title: `Interest coverage of ${cov.display}`, detail: `EBITDA covers interest expense ${cov.display} over the last 12 months.`, quote: null, source: capSrc, strength: covX < 1.5 ? "strong" : "moderate" });
    else if (covX >= 4)
      cards.push({ id: "a:metric:coverage", side: "analyst", kind: "metric", title: `Interest coverage of ${cov.display}`, detail: `EBITDA covers interest expense ${cov.display} over the last 12 months.`, quote: null, source: capSrc, strength: covX >= 6 ? "strong" : "moderate" });
  }
  const liquidity = metric("liquidity");
  if (liquidity && liquidity.display !== "Not available" && capSrc)
    cards.push({ id: "a:metric:liquidity", side: "analyst", kind: "metric", title: `Liquidity of ${liquidity.display}`, detail: `Cash plus undrawn credit lines total ${liquidity.display}.`, quote: null, source: capSrc, strength: "moderate" });
  const maturity = metric("next_maturity");
  if (maturity && maturity.display !== "Not available" && capSrc)
    cards.push({ id: "d:metric:maturity", side: "devil", kind: "metric", title: `Next maturity: ${maturity.display}`, detail: `The next debt maturity in the debt note: ${maturity.display}.`, quote: null, source: capSrc, strength: "weak" });

  // ---- the map: risks with their quotes for the devil, supports for the analyst
  const nodes = report.graph.nodes.filter((n) => !n.isCentral && n.sourceType !== "News" && n.sourceQuote);
  const risks = nodes.filter((n) => n.severity === "high" && (n.type === "risk" || n.type === "regulatory" || n.type === "macro")).slice(0, 4);
  const supports = nodes
    .filter((n) => (n.severity === "low" || n.severity === "none") && (n.type === "company" || n.type === "financial") && /CUSTOMER|LENDS|CREDIT|GUARANT|PARTNER|ANCHOR/.test(`${n.relationType ?? ""} ${n.relationDetail ?? ""}`))
    .slice(0, 4);
  for (const n of risks)
    cards.push({ id: `d:entity:${n.id}`, side: "devil", kind: "entity", title: n.name, detail: `${n.name}: ${n.relationship}.${n.headline ? ` ${n.headline}` : ""}`, quote: n.sourceQuote, source: { label: `${n.sourceType} ${n.fiscalPeriod ?? n.sourceDate}${n.sourcePage ? `, p. ${n.sourcePage}` : ""}`, url: n.sourceUrl }, strength: "moderate" });
  for (const n of supports)
    cards.push({ id: `a:entity:${n.id}`, side: "analyst", kind: "entity", title: n.name, detail: `${n.name}: ${n.relationship}.${n.headline ? ` ${n.headline}` : ""}`, quote: n.sourceQuote, source: { label: `${n.sourceType} ${n.fiscalPeriod ?? n.sourceDate}${n.sourcePage ? `, p. ${n.sourcePage}` : ""}`, url: n.sourceUrl }, strength: "moderate" });

  return cards;
}

const RANK: Record<Strength, number> = { strong: 0, moderate: 1, weak: 2 };

/** Strongest first, so the opening points are the best ones. */
export function byStrength(cards: EvidenceCard[]): EvidenceCard[] {
  return [...cards].sort((a, b) => RANK[a.strength] - RANK[b.strength]);
}
