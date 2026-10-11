import { ExternalLink, FileText, Newspaper } from "lucide-react";
import type { Report } from "@/types";
import { Card } from "@/components/ui/section";

const RULES = [
  "An entity is kept only if its quote is found in the filing or headline it cites.",
  "A figure on a box must appear in that box's own quote. Table amounts need a nearby \"(in thousands)\" heading or a sentence stating the amount in words.",
  "Qualified relationships (sole supplier, anchor tenant, major customer, guarantees) fall back to the plain label unless the quote uses the word. A competitor with no sentence saying it competes is rejected.",
  "Confidence is a label from the source type, whether the relationship is stated or inferred, and whether the quote names the entity.",
  "Generated text (signal, memo, brief, answers) loses any sentence with a figure not in the report, or a ranking word such as largest, earliest or sole that no quote uses.",
  "Total debt must reconcile with the filing's maturities table or the company's tagged XBRL debt; otherwise it reads \"Not reconciled\" and leverage is withheld.",
  "Ratios read n/m when EBITDA is negative. Ratings appear only when a filing or headline states them. There is no bond price feed.",
];

/** The audit trail: every document read, what verification kept and dropped, and the rules applied. */
export function SourcesTab({ report }: { report: Report }) {
  const filings = report.sources.filter((s) => s.sourceType !== "News");
  const news = report.sources.filter((s) => s.sourceType === "News");
  const cited = (url: string) => report.graph.nodes.filter((n) => n.sourceUrl === url).length;
  const v = report.validation;

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Card title="Filings read" why="SEC EDGAR documents behind the map, the debt note and the XBRL figures.">
        <ul className="-my-2 divide-y divide-zinc-800">
          {filings.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2.5">
              <FileText className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-zinc-100">
                  {s.sourceType}
                  {s.fiscalPeriod ? <span className="text-zinc-400"> · {s.fiscalPeriod}</span> : null}
                </span>
                <span className="font-mono text-[11px] text-zinc-500">
                  Filed {s.date} · {cited(s.url)} box{cited(s.url) === 1 ? "" : "es"} cite it
                </span>
              </span>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs text-zinc-400 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-100">
                EDGAR <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Headlines read" why="Ranked by publisher. A box sourced only from a headline is at most medium confidence.">
        {news.length ? (
          <ul className="-my-2 divide-y divide-zinc-800">
            {news.map((s) => (
              <li key={s.id} className="flex items-start gap-3 py-2.5">
                <Newspaper className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
                <span className="min-w-0 flex-1">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-sm text-zinc-200 underline decoration-transparent underline-offset-4 hover:decoration-zinc-500">
                    {s.title}
                  </a>
                  <span className="block font-mono text-[11px] text-zinc-500">
                    {s.date}
                    {cited(s.url) ? ` · ${cited(s.url)} box${cited(s.url) === 1 ? "" : "es"} cite it` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">No headlines were read.</p>
        )}
      </Card>

      <Card title="Verification record" why="What happened to each entity Gemini proposed.">
        {v ? (
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Proposed", v.proposed],
                ["Verified", v.kept],
                ["Rejected", v.rejected.length],
                ["Merged", v.merges.length],
              ].map(([label, n]) => (
                <div key={label} className="border border-zinc-800 bg-zinc-950 px-3 py-2">
                  <dt className="text-[11px] text-zinc-400">{label}</dt>
                  <dd className="font-mono text-lg text-zinc-50">{n}</dd>
                </div>
              ))}
            </dl>
            {v.debtAdded ? <p className="text-zinc-400">{v.debtAdded} debt instruments were added from the verified debt note, outside Gemini&rsquo;s proposals.</p> : null}
            {v.retried ? <p className="text-zinc-400">The first extraction kept too few entities, so it was run again.</p> : null}
            {v.rejected.length ? (
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">Rejected</h3>
                <ul className="mt-2 space-y-3">
                  {v.rejected.map((r) => (
                    <li key={`${r.name}-${r.reason}`}>
                      <p className="text-zinc-100">{r.name}</p>
                      <p className="text-xs text-zinc-400">{r.reason}</p>
                      {r.quote ? <p className="mt-1 border-l border-zinc-700 pl-2 text-xs italic text-zinc-500">&ldquo;{r.quote}&rdquo;</p> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {v.merges.length ? (
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">Merged as duplicates</h3>
                <ul className="mt-2 space-y-1 text-xs text-zinc-400">
                  {v.merges.map((m) => (
                    <li key={`${m.kept}-${m.merged}`}>
                      <span className="text-zinc-200">{m.merged}</span> into <span className="text-zinc-200">{m.kept}</span> ({m.reason})
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">This report predates the verification record.</p>
        )}
      </Card>

      <Card title="Rules applied" why="Gemini reads and classifies; it never supplies a number or quote that is not in the source text.">
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-zinc-300">
          {RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
        <p className="mt-4 font-mono text-[11px] text-zinc-500">
          Report {report.id} · built {report.generatedAt.slice(0, 16).replace("T", " ")} UTC · pipeline v{report.pipelineVersion ?? 1}
        </p>
      </Card>
    </div>
  );
}
