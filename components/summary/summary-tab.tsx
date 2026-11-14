"use client";

import { ArrowRight, CircleAlert, CircleCheck } from "lucide-react";
import type { DistressBand, DistressReason, Report } from "@/types";
import type { TabKey } from "@/components/layout/tab-bar";
import { DistressCard, pctText } from "@/components/distress/distress-card";

/**
 * The plain-English answer, first. Every sentence here is chosen by code from
 * the model's own reasons and the filed figures; no AI writes this page, so it
 * cannot say anything the numbers behind it do not.
 */

const BANDS: { band: DistressBand; label: string; color: string; text: string }[] = [
  { band: "low", label: "Low", color: "#059669", text: "text-emerald-500" },
  { band: "elevated", label: "Elevated", color: "#f59e0b", text: "text-amber-500" },
  { band: "high", label: "High", color: "#dc2626", text: "text-red-500" },
  { band: "severe", label: "Severe", color: "#991b1b", text: "text-red-400" },
];

const VERDICT: Record<DistressBand, string> = {
  low: "Nothing in its filings looks like the companies that went bankrupt.",
  elevated: "Some warning signs. Worth keeping an eye on.",
  high: "Several warning signs that past bankruptcies shared.",
  severe: "Looks like companies that filed for bankruptcy within a year.",
};

/** For a shareholder: what the band means for them, without a buy or sell call. */
const OWNER: Record<DistressBand, string> = {
  low: "Nothing in its filings suggests it can't pay its debts. That says nothing about whether the share price will rise.",
  elevated: "Worth watching. If a company does go bankrupt, shareholders are paid last, after every lender.",
  high: "In a bankruptcy, lenders are paid first and shareholders often get nothing. Read the debate before deciding anything.",
  severe: "Companies that looked like this often filed within a year, and shareholders usually lost most or all of their money. Read the debate before deciding anything.",
};

/** Sentences when a feature pushes the risk up, and when it holds it down. Null where the value's sign must agree first. */
const WORDS: Record<string, { bad: string; good: string; higherIsBetter?: boolean }> = {
  log_assets: { bad: "It's a small company, and small companies fail more often.", good: "It's a large company; large companies rarely fail fast." },
  wc_ta: { bad: "Its bills due this year are large next to the cash and receivables to pay them.", good: "It has plenty of short-term assets to pay this year's bills." },
  re_ta: { bad: "Over its life it has lost more money than it has kept.", good: "Over the years it has kept more profit than it lost.", higherIsBetter: true },
  ebit_ta: { bad: "Its core business earns little or loses money.", good: "Its core business is profitable.", higherIsBetter: true },
  eq_tl: { bad: "Its debts are large next to what the shareholders own.", good: "The shareholders' stake is large next to its debts." },
  tl_ta: { bad: "It owes a lot compared with everything it owns.", good: "It doesn't owe much compared with what it owns." },
  cash_ta: { bad: "It holds little cash for its size.", good: "It holds a lot of cash for its size." },
  ni_ta: { bad: "It is losing money.", good: "It makes a profit.", higherIsBetter: true },
  ocf_tl: { bad: "The cash its business brings in is small next to its debts.", good: "Its business brings in solid cash next to its debts." },
  int_cov: { bad: "Its profits barely cover its interest payments, if at all.", good: "Its profits cover its interest payments comfortably." },
  rev_growth: { bad: "Sales fell over the last year.", good: "Sales grew over the last year.", higherIsBetter: true },
  cash_change: { bad: "Its cash pile shrank over the last year.", good: "Its cash pile grew over the last year.", higherIsBetter: true },
  filing_lag: { bad: "It filed its reports late, which often comes before trouble.", good: "It files its reports on time." },
};

/** The plain sentence, or the model's own label when the value's sign disagrees with the plain sentence. */
function sentence(r: DistressReason, up: boolean): string {
  const w = WORDS[r.feature];
  if (!w) return `${r.label} (${r.display}).`;
  if (w.higherIsBetter && r.value !== null && (up ? r.value > 0 : r.value < 0)) return `${r.label}: ${r.display}. The model counts this ${up ? "against it" : "in its favour"}.`;
  return up ? w.bad : w.good;
}

/** Half-circle gauge: four equal band segments, needle at the middle of the company's band. */
function Gauge({ band }: { band: DistressBand }) {
  const i = BANDS.findIndex((b) => b.band === band);
  const arc = (k: number) => {
    const a0 = Math.PI * (1 - k / 4) - 0.02;
    const a1 = Math.PI * (1 - (k + 1) / 4) + 0.02;
    const p = (a: number, r: number) => `${100 + r * Math.cos(a)} ${100 - r * Math.sin(a)}`;
    return `M ${p(a0, 80)} A 80 80 0 0 1 ${p(a1, 80)}`;
  };
  const needle = Math.PI * (1 - (i + 0.5) / 4);
  return (
    <svg viewBox="0 0 200 112" className="w-full max-w-[260px]" role="img" aria-label={`Risk band: ${BANDS[i].label}`}>
      {BANDS.map((b, k) => (
        <path key={b.band} d={arc(k)} stroke={b.color} strokeWidth={k === i ? 18 : 12} strokeOpacity={k === i ? 1 : 0.35} fill="none" />
      ))}
      <line x1="100" y1="100" x2={100 + 62 * Math.cos(needle)} y2={100 - 62 * Math.sin(needle)} stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-zinc-200" />
      <circle cx="100" cy="100" r="5" className="fill-zinc-200" />
    </svg>
  );
}

const DEEP: { tab: TabKey; title: string; text: string }[] = [
  { tab: "committee", title: "The debate", text: "Two AI analysts argue over the forecast. Every number is checked against the filings." },
  { tab: "capital", title: "Its debt", text: "Every loan and bond, when each is due, and how much cash it has." },
  { tab: "graph", title: "Who it's tied to", text: "Lenders, partners and customers named in its filings." },
  { tab: "memo", title: "Credit memo", text: "The full write-up, with sources." },
];

export function SummaryTab({ report, onTab }: { report: Report; onTab: (t: TabKey) => void }) {
  const d = report.distress;
  const name = report.graph.company.name;
  const metric = (k: string) => report.capital?.metrics.find((m) => m.key === k)?.display ?? null;
  const nextDue = metric("next_maturity");
  const cash = metric("liquidity");
  const doors = report.lme?.verdicts.filter((v) => v.risk === "high").length ?? null;

  const facts: { bad: boolean; text: string }[] = [];
  if (nextDue && nextDue !== "Not disclosed") facts.push({ bad: false, text: `Next debt due: ${nextDue}.` });
  if (cash && cash !== "Not available") facts.push({ bad: false, text: `Cash it can reach now: ${cash}.` });
  if (doors !== null) facts.push(doors ? { bad: true, text: `Its loan papers leave ${doors} door${doors === 1 ? "" : "s"} open to moves that can hurt lenders.` } : { bad: false, text: "Its loan papers close the usual doors to moves that hurt lenders." });

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
              About <span className="font-semibold text-zinc-100">1 in {Math.max(2, Math.round(1 / d.probability)).toLocaleString("en-US")}</span> chance of a bankruptcy filing in the next 12 months ({pctText(d.probability)}). The
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
