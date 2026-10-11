import type { CaseSection, CaseStrength, CaseTheme, CounterCitation, DevilsAdvocate, Entity, PatternResult, Report, WatchItem } from "@/types";
import { CASE_THEMES, MEMO_STANCES } from "@/types/devils-advocate";
import { changeFacts } from "./brief";
import { type PatternContext, runPatterns } from "./devils-advocate-patterns";
import { type Evidence, buildEvidence, glossaryFor } from "./devils-evidence";
import { extractSections } from "./edgar";
import { type Schema, extractFigures, generateJson } from "./gemini";
import { dropUnsupported, entityFacts, marketFacts, toSpans } from "./memo";

/**
 * The Devil's Advocate: a long, structured case against the memo. The evidence
 * (trend tables by quarter, debt, the map, changes, insider trades, 8-Ks, peers,
 * market data and 35 contradiction patterns) is assembled in code; Gemini writes
 * the argument from it, section by section, with a plain-English explanation of
 * each point. Every figure the case uses must appear in the evidence, and every
 * source label and link is built here rather than written by the model.
 */

export const THEME_LABELS: Record<CaseTheme, string> = {
  earnings: "Revenue and earnings quality",
  liquidity: "Cash and liquidity",
  debt: "Debt, maturities and refinancing",
  counterparties: "Customers, suppliers and guarantors",
  changes: "What changed this quarter",
  behavior: "Management and insider behavior",
  peers: "Against the peers",
  market: "What the stock market is saying",
};

const PRIVATE_NOTE = `This is a PRIVATE company. The facts are the documents the user uploaded (credit agreements, lender reports, offering memoranda or similar) and figures extracted from them. There are no SEC filings, stock prices, insider trades or 8-Ks: never mention them. Write a section for each theme the documents give evidence on, even where no exhibit exists, and skip "peers" and "market". The memo is the user's own thesis. For refs, use "doc1", "doc2" and so on for the documents, or "pattern:<pattern id>".

`;

function system(today: string, privateMode = false): string {
  return `${privateMode ? PRIVATE_NOTE : ""}You are a skeptical portfolio manager at a credit fund. Write the full case AGAINST the credit memo below, for an investment committee member who has not read the filings and does not know credit jargon. Today is ${today}.

The facts give you the memo, the reporting period, the entity map, trend tables by quarter, the capital structure, changes since the previous quarter, insider trades, 8-K filings, peers, market data, contradiction patterns and filing text. Use all of it: every exhibit should be used by at least one section when it bears on the case.

Write:
- primer: 4 to 6 sentences for a reader with no context. Say what the company does (from the facts), which quarter and filing this case is based on, with the quarter-end and filing dates, what the memo concludes, and what this case argues instead.
- sections: one per theme, in this order: earnings, liquidity, debt, counterparties, changes, behavior, peers, market. ${privateMode ? "Write a section for each theme the documents give evidence on, except peers and market." : "Write a section only for a theme that has at least one exhibit; skip the others entirely."} For each section:
  - headline: the point as one declarative sentence.
  - memo_says: what the memo says that this point challenges, quoted or closely paraphrased. If the memo does not mention it, write "The memo does not address this."
  - argument: 150 to 250 words. Build an argument, not a recital: do not walk through every row of a table. Use the turning points in time order: where the trend started, the worst quarter, the latest quarter, and the change against the prior quarter and the year-earlier quarter. Name each quarter as the exhibits do and give its end date the first time (for example "Q2 2026, the quarter ended 2026-06-30"). Compare with the prior quarter and the year-earlier quarter where the exhibits give those changes. Use the figures in the exhibits and the findings of the fired patterns; describe what a pattern found rather than naming it as a "pattern". When you mention an entity from the entity list, write it as {{entity_id|name as it reads in the sentence}}.
  - plain_english: 2 or 3 sentences that explain the point to someone with no finance background. Define every technical term you use in everyday words.
  - why_it_matters: 1 or 2 sentences on how this could cost a lender money or lower the chance of being repaid in full and on time.
  - strength: strong, moderate or weak: how hard this point hits the memo, given the evidence.
  - refs: 1 to 4 sources for the section, each one of: an entity id from the list, "pattern:<pattern id>" for a fired pattern, "capital", "filing", "xbrl", "insiders", "eight_k", "market", "peers", "changes".
- bottom_line: one paragraph of 100 to 150 words: the overall case against the memo, naming the strongest points first and the quarter they come from.
- rebuttal: 2 to 4 sentences: the strongest answer the memo's author could give, using facts such as patterns that came back clear or strengths in the tables. Be fair.
- what_to_watch: 3 to 5 items. item: what to check. when: when it will be known, using a filing, quarter or date from the facts (for example "the next 10-Q, for the quarter after Q2 2026" or a maturity date in the facts). signal: what result would confirm this case and what would weaken it.
- patterns_used: the names of the fired patterns the case relies on, exactly as written.
- memo_stance: the stance the MEMO ITSELF takes on this credit, not yours: STABLE, CAUTION, AT_RISK or DISTRESSED.

Rules:
1. Every number you write must appear in the facts exactly as written there. Do not calculate new numbers, round, or convert units. Percent changes are already in the exhibits; copy them.
2. Use only dates and quarters that appear in the facts.
3. Do not write "likely", "probably" or "may". State what the filings show. Where something is not disclosed, say it is not disclosed.
4. No price predictions, no credit ratings, no scores.
5. Complete sentences. No bullet characters or markdown inside strings.`;
}

const SECTION_SCHEMA: Schema = {
  type: "OBJECT",
  properties: {
    theme: { type: "STRING", enum: CASE_THEMES },
    headline: { type: "STRING" },
    memo_says: { type: "STRING" },
    argument: { type: "STRING" },
    plain_english: { type: "STRING" },
    why_it_matters: { type: "STRING" },
    strength: { type: "STRING", enum: ["strong", "moderate", "weak"] },
    refs: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["theme", "headline", "memo_says", "argument", "plain_english", "why_it_matters", "strength", "refs"],
};

const SCHEMA: Schema = {
  type: "OBJECT",
  properties: {
    primer: { type: "STRING" },
    sections: { type: "ARRAY", items: SECTION_SCHEMA },
    bottom_line: { type: "STRING" },
    rebuttal: { type: "STRING" },
    what_to_watch: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { item: { type: "STRING" }, when: { type: "STRING" }, signal: { type: "STRING" } },
        required: ["item", "when", "signal"],
      },
    },
    patterns_used: { type: "ARRAY", items: { type: "STRING" } },
    memo_stance: { type: "STRING", enum: MEMO_STANCES },
  },
  required: ["primer", "sections", "bottom_line", "rebuttal", "what_to_watch", "patterns_used", "memo_stance"],
};

// "May" as a month is fine; the hedge is lowercase.
const HEDGES = /\b(likely|probably|Likely|Probably)\b|\bmay\b/;
const FILING_BUDGET = 20_000;
const MIN_SECTIONS = 3;

function memoText(report: Report): string {
  const signal = report.signal?.length ? `Signal summary: ${report.signal.map((s) => s.text).join("")}\n` : "";
  return (
    signal +
    report.memo.sections.map((s) => `${s.title}: ${s.spans.map((x) => (x.entityId ? `{{${x.entityId}|${x.text}}}` : x.text)).join("")}`).join("\n")
  );
}

function patternFacts(patterns: PatternResult[]): string {
  const fired = patterns.filter((p) => p.status === "fired");
  const clear = patterns.filter((p) => p.status === "clear");
  const firedText = fired.length
    ? fired
        .map((p) => `- id ${p.id} | ${p.name}: ${p.detail}${p.evidence[0]?.quote ? ` Source ${p.evidence[0].label}: "${p.evidence[0].quote}"` : ""}`)
        .join("\n")
    : "- none";
  const clearText = clear.map((p) => `- ${p.name}: ${p.detail}`).join("\n") || "- none";
  return `Contradiction patterns that fired:\n${firedText}\n\nPatterns checked and clear (useful for the rebuttal):\n${clearText}`;
}

/** Risk factors and MD&A of the latest periodic filing, within a budget. */
function filingExcerpt(ctx: PatternContext): string {
  const current = ctx.filings[0];
  if (!current) return "Filing text: not available.";
  const sections = extractSections(`\n${current.text}`).filter((s) => /Risk Factors|Discussion and Analysis/.test(s.label));
  const body = sections.length ? sections.map((s) => `${s.label}\n${s.text}`).join("\n\n") : current.text;
  return `Filing text, ${current.label}:\n${body.slice(0, FILING_BUDGET)}`;
}

function sourceOf(e: Entity): string {
  return [e.sourceType, e.fiscalPeriod ?? e.sourceDate, e.sourcePage ? `p.${e.sourcePage}` : null].filter(Boolean).join(", ");
}

function resolveCitation(ref: string, claim: string, report: Report, patterns: PatternResult[], evidence: Evidence): CounterCitation | null {
  const r = ref.trim();
  const plain = (source: string, url: string | null): CounterCitation => ({ claim, source, url, quote: null, entityId: null, patternId: null });
  if (r.startsWith("pattern:")) {
    const p = patterns.find((x) => x.id === r.slice(8) && x.status === "fired");
    const ev = p?.evidence[0];
    return p ? { claim, source: ev?.label ?? p.name, url: ev?.url ?? null, quote: ev?.quote ?? null, entityId: null, patternId: p.id } : null;
  }
  if (r === "capital") {
    const c = report.capital;
    return c ? plain(`${c.sourceType} ${c.fiscalPeriod ?? c.sourceDate}, capital structure`, c.sourceUrl) : null;
  }
  const known = evidence.sources[r];
  if (known) return plain(known.label, known.url);
  const e = report.graph.nodes.find((n) => n.id === r && !n.isCentral);
  return e ? { claim, source: sourceOf(e), url: e.sourceUrl, quote: e.sourceQuote, entityId: e.id, patternId: null } : null;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const unlink = (t: string) => t.replace(/\{\{[^|}]+\|([^}]+)\}\}/g, "$1").replace(/\{\{([^}]+)\}\}/g, "$1");

/** Every uploaded document, shortened in proportion to fit the budget. */
function documentsExcerpt(ctx: PatternContext): string {
  const total = ctx.filings.reduce((n, f) => n + f.text.length, 0) || 1;
  return ctx.filings
    .map((f, i) => `Document doc${i + 1}, ${f.label}:\n${f.text.slice(0, Math.max(4_000, Math.floor((PRIVATE_BUDGET * f.text.length) / total)))}`)
    .join("\n\n");
}

const PRIVATE_BUDGET = 90_000;

export interface CaseOptions {
  /** Evidence built elsewhere, e.g. from uploaded documents. */
  evidence?: Evidence;
  /** Arguing from uploaded documents: sections need no exhibit, and the prompt says so. */
  privateMode?: boolean;
}

export async function generateDevilsAdvocate(
  report: Report,
  ctx: PatternContext,
  peers: Report[] = [],
  options: CaseOptions = {},
): Promise<DevilsAdvocate> {
  const patterns = runPatterns(ctx);
  const privateMode = options.privateMode ?? false;
  const evidence = options.evidence ?? buildEvidence(report, ctx, peers, patterns);
  const facts = privateMode
    ? [
        `Company: ${report.graph.company.name} (private company)`,
        `Memo (the user's thesis):\n${memoText(report)}`,
        evidence.facts,
        patternFacts(patterns),
        documentsExcerpt(ctx),
      ].join("\n\n")
    : [
    `Company: ${report.graph.company.name} (${report.graph.company.ticker})${report.graph.company.sic ? `, SEC industry: ${report.graph.company.sic}` : ""}${report.graph.company.industry ? `. It describes itself as: "${report.graph.company.industry}"` : ""}`,
    `Memo:\n${memoText(report)}`,
    evidence.facts,
    `Entity list:\n${entityFacts(report.graph.nodes)}`,
    changeFacts(report),
    marketFacts(report.market, report.graph.company.ticker),
    patternFacts(patterns),
    filingExcerpt(ctx),
      ].join("\n\n");
  const allowed = new Set([...extractFigures(facts), ...report.graph.nodes.flatMap((n) => extractFigures(n.sourceDate))]);
  const ids = new Set(report.graph.nodes.map((n) => n.id));
  const names = new Map(report.graph.nodes.map((n) => [n.id, n.name]));

  let best: DevilsAdvocate | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const reminder =
      attempt > 0
        ? "\n\nYour previous answer used numbers not in the facts, hedged with likely, probably or may, or left out themes that have exhibits. Copy every number exactly from the facts and cover every theme that has an exhibit."
        : "";
    let raw: unknown;
    try {
      raw = await generateJson(system(ctx.today, privateMode) + reminder, facts, SCHEMA, { thinking: "low", timeoutMs: 120_000 });
    } catch (error) {
      if (best) break;
      throw error;
    }
    const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    let removed = 0;
    const clean = (t: unknown) => {
      const d = dropUnsupported(str(t), allowed);
      removed += d.removed;
      // When the first sentence was dropped, the next may start lowercase.
      return d.text.charAt(0).toUpperCase() + d.text.slice(1);
    };

    const sections: CaseSection[] = [];
    for (const s of Array.isArray(r.sections) ? r.sections : []) {
      if (typeof s !== "object" || s === null) continue;
      const x = s as Record<string, unknown>;
      const theme = CASE_THEMES.find((t) => t === x.theme);
      // A theme without evidence tables has nothing to argue from.
      if (!theme || sections.some((y) => y.theme === theme)) continue;
      if (privateMode ? theme === "peers" || theme === "market" : evidence.exhibits[theme].length === 0) continue;
      const argument = clean(x.argument);
      const headline = unlink(clean(x.headline));
      if (!argument || !headline) continue;
      const citations = (Array.isArray(x.refs) ? x.refs : [])
        .filter((ref): ref is string => typeof ref === "string")
        .map((ref) => resolveCitation(ref, headline, report, patterns, evidence))
        .filter((c): c is CounterCitation => c !== null)
        .filter((c, i, all) => all.findIndex((o) => o.source === c.source && o.entityId === c.entityId) === i);
      sections.push({
        theme,
        themeLabel: THEME_LABELS[theme],
        headline,
        memoSays: unlink(clean(x.memo_says)),
        argument: toSpans(argument, ids, names),
        plainEnglish: unlink(clean(x.plain_english)),
        whyItMatters: unlink(clean(x.why_it_matters)),
        strength: (["strong", "moderate", "weak"] as CaseStrength[]).find((v) => v === x.strength) ?? "moderate",
        citations,
        exhibits: evidence.exhibits[theme],
      });
    }
    sections.sort((a, b) => CASE_THEMES.indexOf(a.theme) - CASE_THEMES.indexOf(b.theme));

    const bottom = clean(r.bottom_line);
    const watchList: WatchItem[] = (Array.isArray(r.what_to_watch) ? r.what_to_watch : [])
      .filter((w): w is Record<string, unknown> => typeof w === "object" && w !== null)
      .map((w) => ({ item: unlink(clean(w.item)), when: unlink(clean(w.when)), signal: unlink(clean(w.signal)) }))
      .filter((w) => w.item && w.when);
    const primer = unlink(clean(r.primer));
    const rebuttal = unlink(clean(r.rebuttal));

    // Patterns count as used when the model names one or a section cites it.
    const named = (Array.isArray(r.patterns_used) ? r.patterns_used : []).filter((n): n is string => typeof n === "string").map((n) => n.toLowerCase().trim());
    const allCitations = sections.flatMap((s) => s.citations);
    const cited = new Set(allCitations.map((c) => c.patternId));
    const used = patterns.filter((p) => p.status === "fired" && (named.includes(p.name.toLowerCase()) || cited.has(p.id))).map((p) => p.name);

    const written = [primer, bottom, rebuttal, ...sections.flatMap((s) => [s.headline, s.plainEnglish, s.whyItMatters, s.argument.map((a) => a.text).join("")])].join(" ");
    const candidate: DevilsAdvocate = {
      reportId: report.id,
      generatedAt: new Date().toISOString(),
      argument: toSpans(bottom, ids, names),
      citations: allCitations,
      patternsUsed: used,
      whatToWatch: watchList[0] ? `${watchList[0].item} (${watchList[0].when})` : "",
      memoStance: MEMO_STANCES.find((x) => x === r.memo_stance) ?? null,
      patterns,
      removed,
      period: evidence.period,
      primer,
      bottomLine: toSpans(bottom, ids, names),
      sections,
      rebuttal,
      watchList,
      events: evidence.events,
      glossary: glossaryFor(written),
      coverage: evidence.coverage,
    };
    if (sections.length === 0 || !bottom) continue;
    const better = !best || (best.sections?.length ?? 0) < MIN_SECTIONS ? sections.length >= (best?.sections?.length ?? 0) : removed < best.removed;
    if (better) best = candidate;
    if (removed <= 1 && sections.length >= MIN_SECTIONS && !HEDGES.test(written)) break;
  }
  if (!best) throw new Error("Gemini did not return a counter-argument.");
  return best;
}
