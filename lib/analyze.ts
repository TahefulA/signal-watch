import { randomUUID } from "node:crypto";
import type { CapitalStructure, CompanyProfile, Report, SourceDocument } from "@/types";
import { extractCapitalStructure } from "./capital";
import { type CorpusDoc, makeDoc } from "./corpus";
import { toIsoDate } from "./dates";
import {
  type FilingRef,
  excerptFiling,
  extractDebtNotes,
  fetchFilingText,
  getSubmissions,
  lookupCik,
  selectRecentFilings,
} from "./edgar";
import { extractEntities } from "./extraction";
import { GeminiError, geminiEnabled } from "./gemini";
import { addDebtNodes, buildGraph } from "./graph";
import { fetchMarketSnapshot } from "./market";
import { generateMemo } from "./memo";
import { fetchRecentNews } from "./news";
import { type FactBook, fetchFacts, fiscalPeriodOf } from "./xbrl";

/** Below this many verified entities, or above this share rejected, extraction runs once more. */
const MIN_ENTITIES = 12;
const MAX_REJECTED_SHARE = 0.3;

/** Character budget for the debt notes sent to the capital structure call. */
const DEBT_NOTE_BUDGET = 45_000;

export class AnalyzeError extends Error {}

/**
 * Bumped when extraction or verification changes, so stored baselines built by
 * older code are rebuilt rather than compared against.
 */
export const PIPELINE_VERSION = 2;

export type StepReporter = (step: string) => void;

function displayName(raw: string): string {
  const titled = raw
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\b(\w+)&(\w+)\b/g, (m) => m.toUpperCase())
    .replace(/\b(Inc|Corp|Co|Ltd|Plc|Llc)\b\.?/g, (m) => (m.endsWith(".") ? m : `${m}.`))
    .replace(/\b(Llc|Plc)\./g, (m) => m.toUpperCase());
  return titled.replace(/\/[A-Z]{2}\/?$/, "").trim();
}

export interface AnalyzeOptions {
  /**
   * Build a baseline from the filings available on this date, for change
   * detection. Baselines skip news, market data and the memo, which cannot be
   * reconstructed for a past date.
   */
  asOf?: string;
}

/** Runs the full pipeline for one ticker: filings, news, market data, extraction, graph and memo. */
export async function analyzeTicker(rawTicker: string, report: StepReporter, options: AnalyzeOptions = {}): Promise<Report> {
  const ticker = rawTicker.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(ticker)) {
    throw new AnalyzeError(`We couldn't find a company with the ticker ${ticker || "you entered"}. Please check the spelling.`);
  }
  if (!geminiEnabled()) throw new AnalyzeError("Entity extraction is not configured on this server.");
  const baseline = Boolean(options.asOf);
  const today = options.asOf ?? toIsoDate(new Date());

  report("Fetching SEC filings...");
  let lookup: Awaited<ReturnType<typeof lookupCik>>;
  let submissions: Awaited<ReturnType<typeof getSubmissions>>;
  try {
    lookup = await lookupCik(ticker);
    if (!lookup) throw new AnalyzeError(`We couldn't find a company with the ticker ${ticker}. Please check the spelling.`);
    submissions = await getSubmissions(lookup.cik);
  } catch (error) {
    if (error instanceof AnalyzeError) throw error;
    throw new AnalyzeError("SEC EDGAR is currently unavailable. Please try again in a few minutes.");
  }
  const company: CompanyProfile = { ticker, name: displayName(submissions.name), cik: lookup.cik, sic: submissions.sicDescription || null };

  const filings = selectRecentFilings(submissions, today);
  if (!filings.some((f) => f.form === "10-K" || f.form === "10-Q")) {
    throw new AnalyzeError(
      "This company has no recent SEC filings. Signal Watch works best for public companies with 10-K and 10-Q filings.",
    );
  }

  const docs: CorpusDoc[] = [];
  const sources: SourceDocument[] = [];
  // The newest 10-Q or 10-K carries the current debt footnote.
  const periodic = filings.find((f): f is FilingRef => f.form === "10-Q" || f.form === "10-K");
  const debtDocs: CorpusDoc[] = [];
  try {
    for (const filing of filings) {
      const documents = await fetchFilingText(filing);
      const excerpts = excerptFiling(filing, documents);
      const form = filing.form as "10-K" | "10-Q" | "8-K";
      for (const ex of excerpts) {
        const fullText = documents.find((d) => d.url === ex.url)?.text ?? ex.text;
        const doc = makeDoc(`D${docs.length + 1}`, form, filing.filingDate, ex.url, ex.label, ex.text, fullText);
        docs.push(doc);
        if (form === "8-K" && periodic && filing.filingDate > periodic.filingDate) debtDocs.push({ ...doc, id: `F${debtDocs.length + 1}` });
      }
      if (filing === periodic && documents[0]) {
        let budget = DEBT_NOTE_BUDGET;
        for (const note of extractDebtNotes(documents[0].text)) {
          if (budget <= 0) break;
          const text = note.text.slice(0, budget);
          budget -= text.length;
          debtDocs.push(makeDoc(`F${debtDocs.length + 1}`, form, filing.filingDate, documents[0].url, note.label, text, documents[0].text));
        }
      }
      sources.push({
        id: filing.accession,
        sourceType: filing.form as "10-K" | "10-Q" | "8-K",
        title: `${filing.form} filed ${filing.filingDate}`,
        date: filing.filingDate,
        url: excerpts[0]?.url ?? "",
      });
    }
  } catch {
    throw new AnalyzeError("SEC EDGAR is currently unavailable. Please try again in a few minutes.");
  }

  report("Fetching news and market data...");
  const shortName = company.name.replace(/,?\s+(Inc|Corp|Co|Ltd|Plc|Corporation|Company|Holdings)\.?$/i, "");
  const [news, market, facts] = await Promise.all([
    baseline ? [] : fetchRecentNews(`"${shortName}" OR ${ticker} stock`).catch(() => []),
    baseline ? null : fetchMarketSnapshot(ticker, today).catch(() => null),
    fetchFacts(lookup.cik).catch((): FactBook | null => null),
  ]);
  for (const item of news) {
    docs.push(makeDoc(`D${docs.length + 1}`, "News", item.date, item.url, item.publisher || "News", item.headline));
    sources.push({ id: item.id, sourceType: "News", title: item.headline, date: item.date, url: item.url });
  }

  // EDGAR names are upper case; take the company's own casing from its filing text.
  const casing = new RegExp(`\\b${shortName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  for (const doc of docs) {
    const match = doc.sourceType !== "News" ? doc.text.match(casing) : null;
    if (match && match[0] !== match[0].toUpperCase()) {
      company.name = company.name.replace(new RegExp(shortName, "i"), match[0]);
      break;
    }
  }

  // Label each filing excerpt with the fiscal period it covers, e.g. "Q2 2026".
  if (facts) {
    const byUrl = new Map(sources.filter((src) => src.sourceType !== "News").map((src) => [src.url, fiscalPeriodOf(facts, src.id)]));
    for (const doc of [...docs, ...debtDocs]) if (doc.sourceType !== "News" && doc.sourceType !== "8-K") doc.fiscalPeriod = byUrl.get(doc.url) ?? null;
    for (const src of sources) if (src.sourceType === "10-K" || src.sourceType === "10-Q") src.fiscalPeriod = fiscalPeriodOf(facts, src.id);
  }

  report("Extracting entities and debt...");
  const capitalTask: Promise<CapitalStructure | null> =
    periodic && debtDocs.some((d) => d.sourceType !== "8-K")
      ? extractCapitalStructure({
          companyName: company.name,
          ticker,
          cik: lookup.cik,
          docs: debtDocs,
          sourceType: periodic.form as "10-K" | "10-Q",
          sourceDate: periodic.filingDate,
          sourceUrl: debtDocs.find((d) => d.sourceType !== "8-K")?.url ?? "",
          facts,
        }).catch((error: unknown) => {
          console.error("Capital structure extraction failed", error);
          return null;
        })
      : Promise.resolve(null);
  let extraction: Awaited<ReturnType<typeof extractEntities>>;
  try {
    extraction = await extractEntities(company.name, ticker, docs);
  } catch (error) {
    console.error("Entity extraction failed", error);
    if (error instanceof GeminiError && error.kind === "timeout") {
      throw new AnalyzeError("Entity extraction took too long. Please try again.");
    }
    throw new AnalyzeError("We couldn't extract entities from this filing. Please try a different ticker.");
  }

  report("Verifying quotes...");
  let built = buildGraph({ ...company }, extraction, docs);
  const weak = (v: typeof built.validation) => v.kept < MIN_ENTITIES || v.rejected.length > v.proposed * MAX_REJECTED_SHARE;
  if (weak(built.validation)) {
    report("Too few verified entities, extracting again...");
    const retry = await extractEntities(company.name, ticker, docs, { strict: true }).catch(() => null);
    if (retry) {
      const second = buildGraph({ ...company }, retry, docs);
      if (second.validation.kept > built.validation.kept) {
        second.validation.retried = true;
        built = second;
      }
    }
  }
  const capital = await capitalTask;
  if (capital && periodic && facts) capital.fiscalPeriod = fiscalPeriodOf(facts, periodic.accession);
  const { validation } = built;
  const graph = addDebtNodes(built.graph, capital, validation);
  console.info(`${ticker}: ${validation.kept} of ${validation.proposed} entities kept, ${validation.rejected.length} rejected, ${validation.merges.length} merged`);
  const notes: string[] = [];
  if (graph.nodes.length - 1 < 5) {
    notes.push("Limited entities found in recent filings. Try a company with more recent 10-K disclosures.");
  }

  report(baseline ? "Reading the debt note..." : "Generating memo...");
  const memo = baseline ? { sections: [] } : await generateMemo(graph, market);

  return {
    id: randomUUID(),
    generatedAt: new Date().toISOString(),
    graph,
    memo,
    capital,
    market,
    sources,
    filingsAnalyzed: filings.length,
    newsAnalyzed: news.length,
    notes,
    validation,
    asOf: options.asOf ?? null,
    pipelineVersion: PIPELINE_VERSION,
  };
}
