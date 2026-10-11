// Rebuilds the capital structure of saved reports with the current debt extraction, keeping the rest of
// each report. Debt boxes on the map are rebuilt from the new instruments and the timeline is cleared so
// it is rebuilt on next view: npx tsx --env-file=.env.local scripts/refresh-capital.ts <report id> ...
import { extractCapitalStructure } from "../lib/capital";
import { makeDoc } from "../lib/corpus";
import { excerptFiling, extractDebtNotes, fetchFilingHtml, fetchFilingText, getSubmissions } from "../lib/edgar";
import { addDebtNodes } from "../lib/graph";
import { backfillGraph, findReportById, updateReport } from "../lib/tiger";
import { fetchFacts, fiscalPeriodOf } from "../lib/xbrl";
import type { CorpusDoc } from "../lib/corpus";

const BUDGET = 90_000;

async function refresh(id: string) {
  const report = await findReportById(id);
  if (!report) throw new Error(`No report ${id}`);
  const company = report.graph.company;
  const submissions = await getSubmissions(company.cik);
  const refs = report.sources
    .filter((s) => s.sourceType !== "News")
    .map((s) => submissions.filings.find((f) => f.accession === s.id))
    .filter((f): f is NonNullable<typeof f> => f !== undefined)
    .sort((a, b) => b.filingDate.localeCompare(a.filingDate));
  const periodic = refs.filter((f) => f.form === "10-Q" || f.form === "10-K");
  let debtFiling = null;
  let notes: ReturnType<typeof extractDebtNotes> = [];
  let primary: { url: string; text: string } | null = null;
  for (const f of periodic) {
    const [doc] = await fetchFilingText(f);
    const found = extractDebtNotes(doc.text);
    if (found.length) {
      debtFiling = f;
      notes = found;
      primary = doc;
      break;
    }
  }
  if (!debtFiling || !primary) throw new Error(`${company.ticker}: no debt note`);
  const docs: CorpusDoc[] = [];
  let budget = BUDGET;
  for (const note of notes) {
    if (budget <= 0) break;
    const text = note.text.slice(0, budget);
    budget -= text.length;
    docs.push(makeDoc(`F${docs.length + 1}`, debtFiling.form as "10-K" | "10-Q", debtFiling.filingDate, primary.url, note.label, text, primary.text));
  }
  for (const f of refs.filter((r) => r.form === "8-K" && r.filingDate > debtFiling.filingDate)) {
    for (const ex of excerptFiling(f, await fetchFilingText(f))) docs.push(makeDoc(`F${docs.length + 1}`, "8-K", f.filingDate, ex.url, ex.label, ex.text));
  }
  const facts = await fetchFacts(company.cik).catch(() => null);
  const newest = periodic[0];
  const label = (a: string) => (facts ? fiscalPeriodOf(facts, a) : null);
  const noteFallback =
    newest.accession !== debtFiling.accession
      ? `The ${newest.form}${label(newest.accession) ? ` for ${label(newest.accession)}` : ""} filed ${newest.filingDate} has no debt note, so the instrument detail comes from the ${debtFiling.form}${label(debtFiling.accession) ? ` for ${label(debtFiling.accession)}` : ""} filed ${debtFiling.filingDate}.`
      : null;
  const capital = await extractCapitalStructure({
    companyName: company.name,
    ticker: company.ticker,
    cik: company.cik,
    docs,
    sourceType: debtFiling.form as "10-K" | "10-Q",
    sourceDate: debtFiling.filingDate,
    sourceUrl: primary.url,
    facts,
    html: await fetchFilingHtml(debtFiling).catch(() => null),
    noteFallback,
  });
  capital.fiscalPeriod = label(debtFiling.accession);

  // Debt boxes come from the capital structure; drop the old ones and rebuild.
  const debtIds = new Set(report.graph.nodes.filter((n) => n.id.startsWith("debt-")).map((n) => n.id));
  const base = {
    ...report.graph,
    nodes: report.graph.nodes.filter((n) => !debtIds.has(n.id)),
    edges: report.graph.edges.filter((e) => !debtIds.has(e.source) && !debtIds.has(e.target)),
  };
  const validation = report.validation ?? { proposed: 0, kept: 0, rejected: [], merges: [] };
  const merges = validation.merges.filter((m) => m.reason !== "same instrument in the debt note");
  const fresh = { ...validation, merges };
  const graph = addDebtNodes(base, capital, fresh);
  fresh.debtAdded = graph.nodes.filter((n) => n.id.startsWith("debt-")).length;
  const updated = { ...report, capital, graph, validation: fresh, timeline: null };
  await updateReport(updated);
  await backfillGraph(updated);
  console.log(
    `${company.ticker} ${id}: ${capital.instruments.length} lines (${capital.disclosure}), schedule ${capital.maturitySchedule?.source ?? "none"}, total ${capital.metrics.find((m) => m.key === "total_debt")?.display}, ${fresh.debtAdded} debt boxes`,
  );
  for (const i of capital.instruments) console.log(`   ${i.name} | ${i.outstanding ?? "-"} | ${i.coupon ?? "-"} | ${i.maturity ?? "-"} | ${(i.xbrlFields ?? []).join(",")}`);
}

async function main() {
  for (const id of process.argv.slice(2)) await refresh(id);
  process.exit(0);
}

void main();
