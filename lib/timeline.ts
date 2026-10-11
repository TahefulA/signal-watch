import type { Report, Severity, Timeline, TimelineQuarter } from "@/types";
import { containsPassage, filingWordsOf, isDescriptive, mentions, sameEntity, similarPassage } from "./changes";
import { fetchFilingText, filingDocumentUrl, getSubmissions } from "./edgar";
import { findReportById } from "./tiger";
import { fetchFacts, fiscalPeriodOf, periodEndOf } from "./xbrl";

export const TIMELINE_VERSION = 2;

/**
 * Searches the company's last periodic filings (10-Q and 10-K, oldest first)
 * for every entity on the current map. A name counts as present in a quarter
 * when that quarter's filing names it; a model-named risk counts when the
 * filing has the same or a closely reworded passage. Nothing is extracted by
 * Gemini here, so the history is only as wide as the filings' own words.
 */
export async function buildTimeline(report: Report, maxQuarters = 12): Promise<Timeline> {
  const cik = report.graph.company.cik;
  const latestRead = report.sources
    .filter((s) => s.sourceType === "10-Q" || s.sourceType === "10-K")
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const cutoff = latestRead?.date ?? report.generatedAt.slice(0, 10);

  const [submissions, book] = await Promise.all([getSubmissions(cik), fetchFacts(cik).catch(() => null)]);
  const refs = submissions.filings
    .filter((f) => (f.form === "10-Q" || f.form === "10-K") && f.filingDate <= cutoff)
    .sort((a, b) => b.filingDate.localeCompare(a.filingDate))
    .slice(0, maxQuarters)
    .reverse();

  const quarters: TimelineQuarter[] = [];
  const texts = [];
  for (const ref of refs) {
    const docs = await fetchFilingText(ref);
    texts.push(filingWordsOf(docs.map((d) => d.text)));
    quarters.push({
      label: (book && fiscalPeriodOf(book, ref.accession)) ?? `${ref.form} filed ${ref.filingDate}`,
      periodEnd: (book && periodEndOf(book, ref.accession)) ?? ref.filingDate,
      form: ref.form as TimelineQuarter["form"],
      filed: ref.filingDate,
      url: filingDocumentUrl(ref),
    });
  }

  const presence: Timeline["presence"] = {};
  for (const node of report.graph.nodes) {
    if (node.isCentral) continue;
    presence[node.id] = texts.map((text) =>
      isDescriptive(node)
        ? containsPassage(text, node.sourceQuote) || similarPassage(text, node.sourceQuote)
        : mentions(text.sentences, node.name) || (node.type === "financial" && similarPassage(text, node.sourceQuote)),
    );
  }

  // Severity is Gemini's rating, so its history is only the previous quarter's map, when one was built.
  const severityBefore: Record<string, { quarter: string; severity: Severity }> = {};
  const baseline = report.changes?.baselineId ? await findReportById(report.changes.baselineId).catch(() => null) : null;
  if (baseline) {
    const label =
      baseline.sources.filter((s) => s.sourceType === "10-Q" || s.sourceType === "10-K").sort((a, b) => b.date.localeCompare(a.date))[0]?.fiscalPeriod ??
      `As of ${report.changes?.baselineAsOf}`;
    for (const node of report.graph.nodes) {
      const prior = baseline.graph.nodes.find((b) => !b.isCentral && sameEntity(b.name, node.name));
      if (!node.isCentral && prior) severityBefore[node.id] = { quarter: label, severity: prior.severity };
    }
  }

  return { version: TIMELINE_VERSION, builtAt: new Date().toISOString(), quarters, presence, severityBefore };
}
