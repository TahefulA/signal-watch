"use client";

import { useEffect, useState } from "react";
import type { FilingChange, Report } from "@/types";

/** "Lazy Prices": how much each section of the newest 10-K or 10-Q was rewritten against the same form a year earlier. */
export function FilingChangePanel({ report }: { report: Report }) {
  const [change, setChange] = useState<FilingChange | null | undefined>(report.filingChange);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    if (report.filingChange !== undefined) return;
    let live = true;
    fetch("/api/forecast", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportId: report.id }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { filingChange?: FilingChange | null } | null) => live && setChange(body?.filingChange ?? null))
      .catch(() => live && setChange(null));
    return () => {
      live = false;
    };
  }, [report.id, report.filingChange]);

  return (
    <section className="mb-10">
      <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
        <span className="h-1.5 w-1.5 rounded-[1px] bg-red-600" aria-hidden /> What the filing rewrote
      </h3>
      <p className="mb-4 max-w-3xl text-[13px] leading-relaxed text-zinc-400">
        Companies that rewrite their risk factors, legal proceedings or debt notes go on to file for bankruptcy more often, and investors are slow to notice
        (Cohen, Malloy and Nguyen, &ldquo;Lazy Prices&rdquo;). Each section is compared with the same form a year earlier by word-count similarity: 1.00 is
        unchanged.
      </p>
      {change === undefined ? <p className="text-sm text-zinc-500">Comparing the filings&hellip;</p> : null}
      {change === null ? <p className="text-sm text-zinc-500">No filing of the same form about a year earlier was found to compare with.</p> : null}
      {change ? (
        <>
          <p className="text-xs text-zinc-500">
            <a href={change.current.url} target="_blank" rel="noopener noreferrer" className="underline decoration-zinc-700 underline-offset-2 hover:text-zinc-200">
              {change.current.form} filed {change.current.filed}
            </a>{" "}
            against{" "}
            <a href={change.prior.url} target="_blank" rel="noopener noreferrer" className="underline decoration-zinc-700 underline-offset-2 hover:text-zinc-200">
              {change.prior.form} filed {change.prior.filed}
            </a>
            . Overall similarity <span className="font-mono text-zinc-300">{change.overall.toFixed(3)}</span>
            {change.flagged ? <span className="ml-2 font-semibold text-red-500">Key section below {change.threshold.toFixed(2)}</span> : null}
          </p>
          <ul className="mt-3 divide-y divide-zinc-800 border-y border-zinc-800">
            {change.sections.map((s) => {
              const key = /Risk Factors|Legal|Debt/i.test(s.section);
              const low = key && s.similarity < change.threshold;
              return (
                <li key={s.section} className="py-2.5">
                  <button type="button" onClick={() => setOpen(open === s.section ? null : s.section)} className="grid w-full grid-cols-[minmax(0,1fr)_120px_64px] items-center gap-4 text-left" aria-expanded={open === s.section}>
                    <span className="truncate text-[13px] text-zinc-200">
                      {s.section}
                      <span className="ml-2 text-xs text-zinc-500">
                        {s.wordsBefore.toLocaleString()} → {s.wordsNow.toLocaleString()} words · {s.added.length ? `${s.added.length}+ new sentences` : "no new sentences"}
                      </span>
                    </span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                      <span className={`block h-full ${low ? "bg-red-600" : "bg-zinc-500"}`} style={{ width: `${Math.max(2, s.similarity * 100)}%` }} />
                    </span>
                    <span className={`text-right font-mono text-xs ${low ? "text-red-500" : "text-zinc-400"}`}>{s.similarity.toFixed(3)}</span>
                  </button>
                  {open === s.section ? (
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-500">New in {change.current.form}</p>
                        <ul className="mt-1 space-y-1.5 text-xs leading-relaxed text-zinc-300">
                          {s.added.length ? s.added.map((t) => <li key={t}>&ldquo;{t}&rdquo;</li>) : <li className="text-zinc-500">None</li>}
                        </ul>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-red-500">Dropped since {change.prior.form}</p>
                        <ul className="mt-1 space-y-1.5 text-xs leading-relaxed text-zinc-400">
                          {s.removed.length ? s.removed.map((t) => <li key={t}>&ldquo;{t}&rdquo;</li>) : <li className="text-zinc-500">None</li>}
                        </ul>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </section>
  );
}
