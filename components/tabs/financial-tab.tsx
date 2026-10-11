"use client";

import type { ReactNode } from "react";
import type { CapitalMetric, Report, Timeline } from "@/types";
import { RatingGauge, RatioBar, Sparkline, multipleOf, useHistory } from "@/components/capital/financial-metrics-panel";
import { compactMoney } from "@/lib/node-visuals";
import { firedPatterns, itemsFromPatterns } from "@/lib/counter-view";
import { CounterArgumentsCard } from "./counter-arguments-card";
import { type TimeRange, describeWindow, windowOf } from "@/lib/time-range";

type Key = CapitalMetric["key"];

export function TabHeader({ title, meta }: { title: string; meta?: string | null }) {
  return (
    <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-800 pb-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{title}</h2>
      {meta ? <p className="font-mono text-[11px] text-zinc-600">{meta}</p> : null}
    </div>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <h3 className="mb-4 mt-10 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{children}</h3>;
}

function pctChange(now: number, before: number): string | null {
  if (before === 0) return null;
  const p = ((now - before) / Math.abs(before)) * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
}

function MetricCard({ metric, delta, deltaTone, spark }: { metric: CapitalMetric | undefined; delta?: string | null; deltaTone?: "up" | "down" | null; spark?: ReactNode }) {
  if (!metric) return null;
  const missing = metric.display === "Not available" || metric.display === "Not reconciled" || metric.display === "n/m";
  return (
    <div className="rounded-xs border border-zinc-800 bg-zinc-900 p-5" title={metric.note}>
      <p className="text-[11px] uppercase tracking-wider text-zinc-500">{metric.label}</p>
      <p className={`mt-2 font-mono text-2xl font-semibold ${missing ? "text-zinc-500" : "text-zinc-50"}`}>{metric.display}</p>
      {delta ? <p className={`mt-1 font-mono text-[11px] ${deltaTone === "up" ? "text-emerald-500" : deltaTone === "down" ? "text-red-400" : "text-zinc-500"}`}>{delta}</p> : null}
      {spark ? <div className="mt-3">{spark}</div> : null}
    </div>
  );
}

function Row({ metric }: { metric: CapitalMetric | undefined }) {
  if (!metric) return null;
  const missing = metric.display === "Not available" || metric.display === "n/m";
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-zinc-800 py-3" title={metric.note}>
      <span className="text-xs text-zinc-400">{metric.label}</span>
      <span className={`font-mono text-sm font-medium ${missing ? "text-zinc-500" : "text-zinc-100"}`}>{metric.display}</span>
    </div>
  );
}

/** The numbers: earnings, balance sheet, credit ratios against reference bands, rating and liquidity. */
export function FinancialTab({
  report,
  peers,
  timeline,
  range,
  devilBusy = false,
}: {
  report: Report;
  peers: Report[];
  timeline: Timeline | null;
  range: TimeRange;
  devilBusy?: boolean;
}) {
  const capital = report.capital;
  const history = useHistory(report.graph.company.cik, capital?.asOf);
  // Trends cover the selected window of quarters; without the timeline, the last eight.
  const win = timeline ? windowOf(timeline.quarters, range) : null;
  const from = win && timeline && win.end >= 0 ? timeline.quarters[win.start].periodEnd : null;
  const to = win && timeline && win.end >= 0 ? timeline.quarters[win.end].periodEnd : null;
  const inWindow = <T extends { end: string }>(points: T[]) => (from && to ? points.filter((p) => p.end >= from && p.end <= to) : points.slice(-8));
  const rangeText = win && timeline ? describeWindow(timeline.quarters, win) : "Last 8 quarters";
  if (!capital) {
    return <p className="text-sm text-zinc-500">This report predates the financial snapshot. Read the filings again to add it.</p>;
  }
  const m = (k: Key) => capital.metrics.find((x) => x.key === k);
  const peerValues = (key: Key) =>
    peers
      .map((p) => ({ ticker: p.graph.company.ticker, value: multipleOf(p.capital?.metrics.find((x) => x.key === key)?.display ?? "") }))
      .filter((p): p is { ticker: string; value: number } => p.value !== null);

  const rev = inWindow(history?.revenue ?? []);
  const cash = inWindow(history?.cash ?? []);
  const ebitdaQ = inWindow(history?.ebitda ?? []);
  const marginQ = inWindow(history?.ebitdaMargin ?? []);
  const ratioQ = inWindow(history?.currentRatio ?? []);
  const ratioAvg = ratioQ.length >= 2 ? { value: ratioQ.reduce((a, p) => a + p.value, 0) / ratioQ.length, label: `over ${ratioQ.length} quarter ends` } : null;
  const trendHint = rev.length < 2 ? "Choose a longer time range on the Graph tab for quarterly trends." : null;
  const lastTwo = <T,>(a: T[]) => (a.length >= 2 ? [a[a.length - 2], a[a.length - 1]] : null);
  const revPair = lastTwo(rev);
  const cashPair = lastTwo(cash);
  const revDelta = revPair ? pctChange(revPair[1].value, revPair[0].value) : null;
  const cashMove = cashPair ? cashPair[1].value - cashPair[0].value : null;
  const ratings = report.graph.company.ratings ?? [];

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8 lg:px-12">
      <TabHeader
        title="Financial snapshot"
        meta={`As of ${capital.fiscalPeriod ?? "the latest filing"} (period ending ${capital.asOf ?? "n/a"}) · ${capital.sourceType} filed ${capital.sourceDate}`}
      />
      <CounterArgumentsCard
        title="what the statements hide"
        items={itemsFromPatterns(firedPatterns(report.devil, ["financial"]))}
        busy={devilBusy}
        empty={report.devil ? "No financial statement pattern fired on the XBRL facts that are tagged for this company." : "The counter-argument has not been written yet."}
      />
      <p className="-mt-3 mb-5 font-mono text-[11px] text-zinc-500">
        Trends: {rangeText}
        {trendHint ? <span className="text-zinc-600"> · {trendHint}</span> : null}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          metric={m("revenue")}
          delta={revPair && revDelta ? `Latest quarter ${compactMoney(revPair[1].value)}, ${revDelta} vs prior quarter` : null}
          deltaTone={revPair ? (revPair[1].value >= revPair[0].value ? "up" : "down") : null}
          spark={rev.length >= 2 ? <Sparkline points={rev} label="Quarterly revenue" large /> : null}
        />
        <MetricCard
          metric={m("ebitda")}
          delta={ebitdaQ.length >= 2 ? `Latest quarter ${compactMoney(ebitdaQ[ebitdaQ.length - 1].value)} · operating income plus D&A` : "Operating income plus depreciation and amortization"}
          spark={ebitdaQ.length >= 2 ? <Sparkline points={ebitdaQ} label="Quarterly EBITDA" large /> : null}
        />
        <MetricCard
          metric={m("ebitda_margin")}
          delta={marginQ.length >= 2 ? `Latest quarter ${marginQ[marginQ.length - 1].value.toFixed(1)}% · EBITDA over revenue` : "EBITDA over revenue, last 12 months"}
          spark={marginQ.length >= 2 ? <Sparkline points={marginQ} label="Quarterly EBITDA margin (%)" large percent /> : null}
        />
        <MetricCard metric={m("total_debt")} />
        <MetricCard metric={m("net_debt")} delta="Total debt less cash" />
        <MetricCard
          metric={m("cash")}
          delta={cashMove !== null ? `${cashMove >= 0 ? "+" : "-"}${compactMoney(Math.abs(cashMove))} vs prior quarter end` : null}
          deltaTone={cashMove === null ? null : cashMove >= 0 ? "up" : "down"}
          spark={cash.length >= 2 ? <Sparkline points={cash} label="Quarter-end cash" large /> : null}
        />
      </div>

      <SectionTitle>Credit metrics</SectionTitle>
      <div className="grid grid-cols-1 gap-x-12 lg:grid-cols-2">
        {(["debt_to_ebitda", "net_debt_to_ebitda", "interest_coverage", "current_ratio"] as Key[]).map((k) => {
          const metric = m(k);
          return metric ? <RatioBar key={k} metric={metric} peers={peerValues(k)} average={k === "current_ratio" ? ratioAvg : null} /> : null;
        })}
      </div>
      <p className="mt-3 text-[11px] text-zinc-500">
        Bands are common leveraged-credit rules of thumb, for orientation only. White dot: this company now. Tick: its average over the window, where the quarterly history exists. Hollow: peers loaded on the Peers tab. n/m: EBITDA is negative.
      </p>

      <div className="grid grid-cols-1 gap-x-12 lg:grid-cols-2">
        <div>
          <SectionTitle>Credit rating</SectionTitle>
          {ratings.length ? (
            ratings.map((r) => (
              <div key={`${r.agency}-${r.rating}`} className="flex items-baseline justify-between gap-4 border-b border-zinc-800 py-3" title={r.citation.quote}>
                <span className="text-xs text-zinc-500">
                  {r.agency}
                  {r.subject ? `, ${r.subject}` : ""}
                </span>
                <span className="font-mono text-base font-semibold text-zinc-100">
                  {r.rating}
                  {r.outlook ? <span className="text-zinc-400"> {r.outlook}</span> : null}
                </span>
              </div>
            ))
          ) : (
            <div className="flex items-baseline justify-between gap-4 border-b border-zinc-800 py-3">
              <span className="text-xs text-zinc-500">S&amp;P, Moody&rsquo;s, Fitch</span>
              <span className="font-mono text-sm text-zinc-500">Not stated in the filings read</span>
            </div>
          )}
          <RatingGauge ratings={ratings} />
          <p className="mt-3 text-[11px] text-zinc-500">Ratings appear only when a filing or headline states them. Signal Watch does not license rating agency data.</p>
        </div>
        <div>
          <SectionTitle>Liquidity</SectionTitle>
          <Row metric={m("cash")} />
          <Row metric={m("revolver_availability")} />
          <Row metric={m("liquidity")} />
          <Row metric={m("fcf")} />
          <Row metric={m("next_maturity")} />
        </div>
      </div>

      <details className="mt-10 border-t border-zinc-800 pt-4">
        <summary className="cursor-pointer list-none text-xs text-zinc-400 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-100">How each figure is built</summary>
        <dl className="mt-3 grid grid-cols-1 gap-x-12 gap-y-2 text-xs leading-snug lg:grid-cols-2">
          {capital.metrics.map((x) => (
            <div key={x.key}>
              <dt className="inline text-zinc-300">{x.label}: </dt>
              <dd className="inline text-zinc-500">{x.note}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
