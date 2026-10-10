import type { BriefItem, MeetingBrief, Report } from "@/types";
import { citationLine } from "@/components/ui/citation";

interface BriefViewProps {
  brief: MeetingBrief;
  report: Report;
}

function Heading({ children }: { children: string }) {
  return <h3 className="text-xs font-medium uppercase tracking-widest text-zinc-500 print:text-zinc-600">{children}</h3>;
}

/** Inline evidence for a line: the filing line of each entity it names. */
function Evidence({ item }: { item: BriefItem }) {
  if (item.citations.length === 0 && item.sources.length === 0) return null;
  return (
    <div className="mt-1 space-y-1">
      {item.citations.map((c) => (
        <p key={c.quote} className="print-muted text-xs leading-relaxed text-zinc-500">
          <span className="italic">&ldquo;{c.quote}&rdquo;</span>{" "}
          <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] underline decoration-zinc-700 underline-offset-2">
            {citationLine(c)}
          </a>
        </p>
      ))}
      {item.sources.map((s) => (
        <p key={s.url} className="text-xs text-zinc-500 print:text-zinc-600">
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] underline decoration-zinc-700 underline-offset-2">
            {s.label}
          </a>
        </p>
      ))}
    </div>
  );
}

function Line({ item }: { item: BriefItem }) {
  return <>{item.spans.map((s, i) => (s.entityId ? <strong key={i} className="font-medium text-zinc-100 print:text-black">{s.text}</strong> : <span key={i}>{s.text}</span>))}</>;
}

/** The one-page brief. Server-safe: no state or handlers, so it renders on the printable page too. */
export function BriefView({ brief, report }: BriefViewProps) {
  const company = report.graph.company;
  return (
    <article className="print-brief space-y-7 text-zinc-300 print:space-y-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-800 pb-4 print:border-zinc-300">
        <div>
          <p className="font-mono text-xs text-zinc-500">{company.ticker} · Meeting brief</p>
          <h2 className="font-display text-2xl font-bold tracking-tight text-zinc-100 print:text-black">{company.name}</h2>
        </div>
        <p className="font-mono text-[10px] text-zinc-500">
          Prepared {brief.generatedAt.slice(0, 10)} from {report.filingsAnalyzed} filings and {report.newsAnalyzed} headlines
        </p>
      </header>

      <section>
        <Heading>Three things to know</Heading>
        <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm leading-relaxed">
          {brief.mustKnow.map((item, i) => (
            <li key={i}>
              <Line item={item} />
              <Evidence item={item} />
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-7 md:grid-cols-2 print:grid-cols-2">
        <section>
          <Heading>The numbers</Heading>
          <dl className="mt-3 divide-y divide-zinc-800 text-sm print:divide-zinc-200">
            {brief.numbers.map((n) => (
              <div key={n.label} className="flex justify-between gap-4 py-1.5" title={n.note}>
                <dt className="text-zinc-400 print:text-zinc-600">{n.label}</dt>
                <dd className="text-right font-mono text-zinc-100 print:text-black">{n.display}</dd>
              </div>
            ))}
          </dl>
          {report.capital ? (
            <p className="mt-2 font-mono text-[10px] text-zinc-500">
              Debt from the {report.capital.sourceType} filed {report.capital.sourceDate}; EBITDA and cash from XBRL.
            </p>
          ) : null}
        </section>

        <section>
          <Heading>Risks to watch</Heading>
          <ul className="mt-3 space-y-3 text-sm">
            {brief.risks.map((r) => (
              <li key={r.entityId}>
                <span className="text-zinc-100 print:text-black">{r.name}</span>
                <span className="ml-2 text-xs text-zinc-500">{r.severity} severity</span>
                <p className="print-muted mt-0.5 text-xs italic leading-relaxed text-zinc-500 print:line-clamp-2">&ldquo;{r.citation.quote}&rdquo;</p>
                <a href={r.citation.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] text-zinc-500 underline decoration-zinc-700 underline-offset-2">
                  {citationLine(r.citation)}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section>
        <Heading>Questions to ask</Heading>
        {brief.questions.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No questions could be drafted from the gaps in this report.</p>
        ) : (
          <ol className="mt-3 list-decimal space-y-2.5 pl-5 text-sm leading-relaxed">
            {brief.questions.map((q, i) => (
              <li key={i}>
                <Line item={q} />
                {q.basis ? <p className="print-muted text-xs text-zinc-500">Why: {q.basis}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <Heading>Comparables</Heading>
        {brief.comparables ? (
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs text-zinc-500 print:border-zinc-300">
                <th className="py-1.5 pr-4 font-medium">Metric</th>
                {brief.comparables.tickers.map((t) => (
                  <th key={t} className="py-1.5 pr-4 font-mono font-medium">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {brief.comparables.rows.map((row) => (
                <tr key={row.label} className="border-b border-zinc-800/60 print:border-zinc-200">
                  <td className="py-1.5 pr-4 text-zinc-400 print:text-zinc-600">{row.label}</td>
                  {row.values.map((v) => (
                    <td key={v.ticker} className="py-1.5 pr-4 font-mono text-zinc-100 print:text-black">
                      {v.display}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">No peers were compared. Run a peer comparison, then prepare the brief again.</p>
        )}
      </section>

      <p className="border-t border-zinc-800 pt-3 text-[11px] leading-relaxed text-zinc-500 print:border-zinc-300">
        The three things to know and the questions are drafted by Gemini from this report; any sentence with a figure not in the report was removed.
        The numbers, risks and comparables are taken directly from the report.
      </p>
    </article>
  );
}
