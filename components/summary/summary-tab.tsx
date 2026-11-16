"use client";

import { ArrowRight, CircleAlert, CircleCheck } from "lucide-react";
import type { Report } from "@/types";
import type { TabKey } from "@/components/layout/tab-bar";
import { AlertSignup } from "./alert-signup";
import { DistressCard } from "@/components/distress/distress-card";
import { BANDS, OWNER, VERDICT, oneIn, pctText, sentence, summaryFacts } from "@/lib/summary-words";
import { Gauge } from "./gauge";

/**
 * The plain-English answer, first. Every sentence here is chosen by code from
 * the model's own reasons and the filed figures; no AI writes this page, so it
 * cannot say anything the numbers behind it do not.
 */

const DEEP: { tab: TabKey; title: string; text: string }[] = [
  { tab: "committee", title: "The debate", text: "Two AI analysts argue over the forecast. Every number is checked against the filings." },
  { tab: "capital", title: "Its debt", text: "Every loan and bond, when each is due, and how much cash it has." },
  { tab: "graph", title: "Who it's tied to", text: "Lenders, partners and customers named in its filings." },
  { tab: "memo", title: "Credit memo", text: "The full write-up, with sources." },
];

export function SummaryTab({ report, onTab }: { report: Report; onTab: (t: TabKey) => void }) {
  const d = report.distress;
  const name = report.graph.company.name;

  const facts = summaryFacts(report);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold text-zinc-50 sm:text-2xl">Could {name} go bankrupt in the next year?</h1>

      {d ? (
        <section className="surface mt-4 flex flex-col items-center gap-4 rounded-xs border border-zinc-800 p-5 sm:flex-row sm:items-center sm:gap-8">
          <div className="flex shrink-0 flex-col items-center">
            <Gauge band={d.band} />
            <p className={`-mt-2 text-lg font-bold ${BANDS.find((b) => b.band === d.band)?.text}`}>{BANDS.find((b) => b.band === d.band)?.label} risk</p>
          </div>
          <div className="min-w-0">
            <p className="text-lg text-zinc-100">{VERDICT[d.band]}</p>
            <p className="mt-2 text-sm text-zinc-400">
              About <span className="font-semibold text-zinc-100">{oneIn(d.probability)}</span> chance of a bankruptcy filing in the next 12 months ({pctText(d.probability)}). The
              average company in the model&rsquo;s data is 1 in {Math.round(1 / d.baseRate).toLocaleString("en-US")}.
            </p>
            <p className="mt-2 text-xs text-zinc-500">From its SEC filings up to {d.periodEnd}. A model trained on past bankruptcies computes it; no AI guesses the number.</p>
          </div>
        </section>
      ) : (
        <p className="surface mt-4 rounded-xs border border-zinc-800 p-4 text-sm text-zinc-400">There isn&rsquo;t enough filed financial data to score this company.</p>
      )}

      {d ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <section className="surface rounded-xs border border-zinc-800 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-red-500">What worries the model</h2>
            {d.reasons.length ? (
              <ul className="mt-2 space-y-2">
                {d.reasons.map((r) => (
                  <li key={r.feature} className="flex gap-2 text-sm text-zinc-200">
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden />
                    {sentence(r, true)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-zinc-400">Nothing stands out.</p>
            )}
          </section>
          <section className="surface rounded-xs border border-zinc-800 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-emerald-500">What&rsquo;s in its favour</h2>
            {d.offsets.length ? (
              <ul className="mt-2 space-y-2">
                {d.offsets.map((r) => (
                  <li key={r.feature} className="flex gap-2 text-sm text-zinc-200">
                    <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                    {sentence(r, false)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-zinc-400">Nothing stands out.</p>
            )}
          </section>
        </div>
      ) : null}

      {d ? (
        <p className="surface mt-4 rounded-xs border border-zinc-800 px-4 py-3 text-sm leading-relaxed text-zinc-300">
          <span className="font-semibold text-zinc-100">If you own the stock: </span>
          {OWNER[d.band]}
        </p>
      ) : null}

      {facts.length ? (
        <ul className="mt-4 space-y-1 text-sm text-zinc-300">
          {facts.map((f) => (
            <li key={f.text} className="flex gap-2">
              <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${f.bad ? "bg-red-500" : "bg-zinc-500"}`} aria-hidden />
              {f.text}
            </li>
          ))}
        </ul>
      ) : null}

      <AlertSignup ticker={report.graph.company.ticker} />

      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wider text-zinc-500">Deep dive, for credit analysts</h2>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {DEEP.map((x) => (
          <button key={x.tab} type="button" onClick={() => onTab(x.tab)} className="surface group rounded-xs border border-zinc-800 p-3 text-left hover:border-zinc-600">
            <span className="flex items-center justify-between text-sm font-medium text-zinc-100">
              {x.title} <ArrowRight className="h-4 w-4 text-zinc-500 group-hover:text-zinc-200" aria-hidden />
            </span>
            <span className="mt-0.5 block text-[12px] text-zinc-400">{x.text}</span>
          </button>
        ))}
      </div>
      {d ? (
        <details className="mt-6">
          <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-200">Model details: every input and the date it was filed</summary>
          <div className="mt-3">
            <DistressCard distress={d} />
          </div>
        </details>
      ) : null}
      <p className="mt-6 text-xs text-zinc-600">Not financial advice.</p>
    </div>
  );
}
