import { randomUUID } from "node:crypto";
import type { CompanyProfile, Report, SourceDocument } from "@/types";
import { type CorpusDoc, makeDoc } from "./corpus";
import { toIsoDate } from "./dates";
import { excerptFiling, fetchFilingText, getSubmissions, lookupCik, selectRecentFilings } from "./edgar";
import { extractEntities } from "./extraction";
import { GeminiError, geminiEnabled } from "./gemini";
import { buildGraph } from "./graph";
import { fetchMarketSnapshot } from "./market";
import { generateMemo } from "./memo";
import { fetchRecentNews } from "./news";

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
  try {
    for (const filing of filings) {
      const excerpts = excerptFiling(filing, await fetchFilingText(filing));
      for (const ex of excerpts) {
        docs.push(makeDoc(`D${docs.length + 1}`, filing.form as "10-K" | "10-Q" | "8-K", filing.filingDate, ex.url, ex.label, ex.text));
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
  const [news, market] = await Promise.all([
    fetchRecentNews(`"${shortName}" OR ${ticker} stock`).catch(() => []),
    fetchMarketSnapshot(ticker, today).catch(() => null),
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

  report("Extracting entities...");
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
  const memo = await generateMemo(graph, market);

  return {
    id: randomUUID(),
    generatedAt: new Date().toISOString(),
    graph,
    memo,
    market,
    sources,
    filingsAnalyzed: filings.length,
    newsAnalyzed: news.length,
    notes,
  };
}
