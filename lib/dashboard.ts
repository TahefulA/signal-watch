import type { Report, SourceDocument, WatchCard } from "@/types";
import { filingDocumentUrl, getSubmissions, lookupCik } from "./edgar";
import { findLatestReport } from "./tiger";

const FORMS = new Set(["10-K", "10-Q", "8-K"]);

/** Filings on EDGAR after the newest filing a report read. */
export async function filingsSince(report: Report): Promise<SourceDocument[]> {
  const read = report.sources.filter((s) => s.sourceType !== "News");
  const newest = read.map((s) => s.date).sort().at(-1);
  if (!newest) return [];
  const known = new Set(read.map((s) => s.id));
  const submissions = await getSubmissions(report.graph.company.cik);
  return submissions.filings
    .filter((f) => FORMS.has(f.form) && f.filingDate > newest && !known.has(f.accession))
    .slice(0, 5)
    .map((f) => ({
      id: f.accession,
      sourceType: f.form as "10-K" | "10-Q" | "8-K",
      title: `${f.form} filed ${f.filingDate}`,
      date: f.filingDate,
      url: filingDocumentUrl(f),
    }));
}

function metric(report: Report, key: string): string | null {
  const display = report.capital?.metrics.find((m) => m.key === key)?.display;
  return display && display !== "Not available" ? display : null;
}

export async function watchCard(ticker: string): Promise<WatchCard> {
  const report = await findLatestReport(ticker);
  if (!report) {
    const lookup = await lookupCik(ticker).catch(() => null);
    return {
      ticker,
      name: lookup?.title ?? null,
      reportId: null,
      generatedAt: null,
      entityCount: 0,
      highSeverity: [],
      totalDebt: null,
      liquidity: null,
      ebitda: null,
      return90d: null,
      newFilings: [],
      changeCounts: null,
    };
  }
  const entities = report.graph.nodes.filter((n) => !n.isCentral && n.change?.kind !== "removed");
  const facts = report.changes?.changes.filter((c) => !c.judgment) ?? null;
  return {
    ticker,
    name: report.graph.company.name,
    reportId: report.id,
    generatedAt: report.generatedAt,
    entityCount: entities.length,
    highSeverity: entities.filter((e) => e.severity === "high").map((e) => e.name),
    totalDebt: metric(report, "total_debt"),
    liquidity: metric(report, "liquidity"),
    ebitda: metric(report, "ebitda"),
    return90d: report.market?.return90d ?? null,
    newFilings: await filingsSince(report).catch(() => []),
    changeCounts: facts
      ? {
          new: facts.filter((c) => c.kind === "new" || c.kind === "new_debt").length,
          changed: facts.filter((c) => c.kind === "magnitude" || c.kind === "debt_amount").length,
          removed: facts.filter((c) => c.kind === "removed" || c.kind === "repaid_debt").length,
        }
      : null,
  };
}
