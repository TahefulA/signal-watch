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
import { buildGraph } from "./graph";
import { fetchMarketSnapshot } from "./market";
import { generateMemo } from "./memo";
import { fetchRecentNews } from "./news";
import { type FactBook, fetchFacts } from "./xbrl";

/** Character budget for the debt notes sent to the capital structure call. */
const DEBT_NOTE_BUDGET = 45_000;

export class AnalyzeError extends Error {}

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

/** Runs the full pipeline for one ticker: filings, news, market data, extraction, graph and memo. */
export async function analyzeTicker(rawTicker: string, report: StepReporter): Promise<Report> {
  const ticker = rawTicker.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(ticker)) {
    throw new AnalyzeError(`We couldn't find a company with the ticker ${ticker || "you entered"}. Please check the spelling.`);
  }
  if (!geminiEnabled()) throw new AnalyzeError("Entity extraction is not configured on this server.");
  const today = toIsoDate(new Date());

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
  const company: CompanyProfile = { ticker, name: displayName(submissions.name), cik: lookup.cik };

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
    fetchRecentNews(`"${shortName}" OR ${ticker} stock`).catch(() => []),
    fetchMarketSnapshot(ticker, today).catch(() => null),
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

  report("Building map...");
  const { graph, dropped } = buildGraph(company, extraction, docs);
  if (dropped.length > 0) console.info(`${ticker}: dropped ${dropped.length} entities without a verifiable quote: ${dropped.join(", ")}`);
  const notes: string[] = [];
  if (graph.nodes.length - 1 < 5) {
    notes.push("Limited entities found in recent filings. Try a company with more recent 10-K disclosures.");
  }

  report("Generating memo...");
  const [memo, capital] = await Promise.all([generateMemo(graph, market), capitalTask]);

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
  };
}
