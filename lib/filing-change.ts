import type { FilingChange, SectionChange } from "@/types";
import { daysBetween } from "./dates";
import { type FilingRef, extractDebtNotes, extractSections, fetchFilingText, filingDocumentUrl, splitSentences } from "./edgar";

/**
 * "Lazy Prices" (Cohen, Malloy and Nguyen, 2020): companies that rewrite their
 * 10-K or 10-Q, especially risk factors and legal proceedings, go on to
 * underperform and file for bankruptcy more often, and investors are slow to
 * notice. This compares the newest periodic filing with the same form a year
 * earlier, section by section, using cosine similarity of word counts as the
 * paper does, and lists the sentences added and removed. Plain arithmetic on
 * the filing text; no model reads it.
 */

/** Below this, a key section changed more than usual. Calibrated by scripts/backtest-filing-change.ts. */
export const DEFAULT_THRESHOLD = 0.9;

const KEY_SECTIONS = /Risk Factors|Legal Proceedings|Debt|Borrowings|Credit Facilit|Notes Payable/i;

const LEGAL = /\n\s*Item\s*(?:3|1)\s*\.?\s*[\-–—:]?\s*Legal Proceedings\.?\s*\n/gi;
const ITEM_HEADING = /\n\s*Item\s*\d+[A-C]?\s*\.?\s*[\-–—:]?\s*[A-Z][^\n]{2,90}\n/gi;

/** Legal proceedings, which extractSections does not cover. The longest match skips the table of contents. */
function legalSection(text: string): { label: string; text: string } | null {
  const headings = Array.from(text.matchAll(ITEM_HEADING)).map((m) => m.index ?? 0);
  let best = "";
  for (const match of text.matchAll(LEGAL)) {
    const from = (match.index ?? 0) + match[0].length;
    const next = headings.find((h) => h > from + 50) ?? text.length;
    const body = text.slice(from, next);
    if (body.length > best.length) best = body;
  }
  return best.length > 200 ? { label: "Legal Proceedings", text: best } : null;
}

/** Sections compared: business, risk factors, MD&A, legal proceedings and the debt notes. */
export function comparableSections(text: string): { label: string; text: string }[] {
  const out = extractSections(text)
    .filter((s) => !/Controls and Procedures/.test(s.label))
    .map((s) => ({ label: s.label.replace(/^Item \w+\.\s*/, "").replace(/’/g, "'"), text: s.text }));
  const legal = legalSection(text);
  if (legal) out.push(legal);
  const debt = extractDebtNotes(text);
  if (debt.length) out.push({ label: "Debt notes", text: debt.map((d) => d.text).join("\n") });
  return out;
}

function words(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const w of text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []) counts.set(w, (counts.get(w) ?? 0) + 1);
  return counts;
}

export function cosine(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  let dot = 0;
  let nx = 0;
  let ny = 0;
  for (const [w, c] of x) {
    nx += c * c;
    dot += c * (y.get(w) ?? 0);
  }
  for (const c of y.values()) ny += c * c;
  return nx && ny ? dot / Math.sqrt(nx * ny) : 0;
}

/** Sentences compared without numbers and spacing, so an updated date or amount is not a new sentence. */
const norm = (s: string) => s.toLowerCase().replace(/[\d$,.%]+/g, "#").replace(/\s+/g, " ").trim();

function sentenceDiff(now: string, before: string, limit = 6): { added: string[]; removed: string[] } {
  const a = splitSentences(now);
  const b = splitSentences(before);
  const aSet = new Set(a.map(norm));
  const bSet = new Set(b.map(norm));
  const added = a.filter((s) => !bSet.has(norm(s))).sort((x, y) => y.length - x.length);
  const removed = b.filter((s) => !aSet.has(norm(s))).sort((x, y) => y.length - x.length);
  return { added: added.slice(0, limit), removed: removed.slice(0, limit) };
}

export function compareTexts(now: string, before: string): Omit<FilingChange, "current" | "prior" | "threshold" | "flagged"> & { keyMin: number | null } {
  const a = comparableSections(now);
  const b = comparableSections(before);
  const sections: SectionChange[] = [];
  let weighted = 0;
  let weight = 0;
  for (const s of a) {
    const match = b.find((x) => x.label === s.label);
    if (!match) continue;
    const similarity = cosine(s.text, match.text);
    const diff = sentenceDiff(s.text, match.text);
    const wordsNow = s.text.split(/\s+/).length;
    sections.push({ section: s.label, similarity, ...diff, wordsNow, wordsBefore: match.text.split(/\s+/).length });
    weighted += similarity * wordsNow;
    weight += wordsNow;
  }
  const key = sections.filter((s) => KEY_SECTIONS.test(s.section)).map((s) => s.similarity);
  return { overall: weight ? weighted / weight : 1, sections, keyMin: key.length ? Math.min(...key) : null };
}

/** The same form about a year before: last year's 10-K, or the 10-Q for the same quarter last year. */
export function priorFiling(filings: FilingRef[], latest: FilingRef): FilingRef | null {
  return (
    filings
      .filter((f) => f.form === latest.form && f.filingDate < latest.filingDate)
      .map((f) => ({ f, gap: Math.abs(daysBetween(f.filingDate, latest.filingDate) - 365) }))
      .filter((x) => x.gap <= 60)
      .sort((a, b) => a.gap - b.gap)[0]?.f ?? null
  );
}

export async function filingChange(filings: FilingRef[], threshold = DEFAULT_THRESHOLD): Promise<FilingChange | null> {
  const latest = filings.find((f) => f.form === "10-K" || f.form === "10-Q");
  if (!latest) return null;
  const prior = priorFiling(filings, latest);
  if (!prior) return null;
  const [now, before] = await Promise.all([fetchFilingText(latest), fetchFilingText(prior)]);
  if (!now[0] || !before[0]) return null;
  const result = compareTexts(now[0].text, before[0].text);
  if (!result.sections.length) return null;
  return {
    current: { form: latest.form, filed: latest.filingDate, url: filingDocumentUrl(latest) },
    prior: { form: prior.form, filed: prior.filingDate, url: filingDocumentUrl(prior) },
    overall: result.overall,
    sections: result.sections,
    flagged: result.keyMin !== null && result.keyMin < threshold,
    threshold,
  };
}
