"use client";

import { useMemo } from "react";
import type { Report, Timeline } from "@/types";
import { useHistory } from "@/components/capital/financial-metrics-panel";
import { TrendChart } from "@/components/charts/trend-chart";
import { buildForecast } from "@/lib/forecast";
import { compactMoney, parseDisplayMoney } from "@/lib/node-visuals";

const COLORS = { strong: "#059669", base: "#2563eb", downside: "#dc2626" } as const;

/** Gatto's Step 4: three cases for the company's cash over the next two years, computed from its own history. */
export function ForecastPanel({ report, timeline }: { report: Report; timeline: Timeline | null }) {
  const capital = report.capital ?? null;
  const history = useHistory(report.graph.company.cik, capital?.asOf);
  const undrawn = useMemo(() => {
    const display = capital?.metrics.find((m) => m.key === "revolver_availability")?.display ?? "";
    return parseDisplayMoney(display.replace(/^Up to /, ""));
  }, [capital]);
  const forecast = useMemo(
    () => (history ? buildForecast({ fcf: history.fcf ?? [], cash: history.cash, schedule: capital?.maturitySchedule?.rows ?? null, undrawn }) : null),
    [history, capital, undrawn],
  );
  const label = (end: string) =>
    timeline?.quarters.find((q) => q.periodEnd === end)?.label ??
    new Date(`${end}T00:00:00Z`).toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }).replace(" ", " '");

  return (
    <section data-tour="forecast" className="mb-10">
      <h3 className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        <span className="h-1.5 w-1.5 rounded-[1px] bg-red-600" aria-hidden /> Forecast: how long does the cash last?
      </h3>
      <p className="mb-4 max-w-3xl text-[13px] leading-relaxed text-zinc-400">
        Three cases built from the company&rsquo;s own last eight quarters, not predicted by AI. Each repeats a quarter of free cash flow the company has
        already had, subtracts debt principal when the debt note says it is due, and assumes no new borrowing or share sales.
      </p>

      {!capital?.asOf ? (
        <p className="text-sm text-zinc-500">This report predates the financial snapshot. Read the filings again to add the forecast.</p>
      ) : !history ? (
        <p className="font-mono text-xs text-zinc-500">Loading quarterly figures from XBRL...</p>
      ) : !forecast ? (
        <p className="text-sm text-zinc-500">Free cash flow is not tagged for enough quarters, so the cases cannot be built from this company&rsquo;s data.</p>
      ) : (
        <>
          <TrendChart
            title="Cash at each quarter end, actual then projected"
            kind="line"
            series={forecast.cases.map((c) => ({
              label: c.label,
              color: COLORS[c.key],
              points: [{ end: forecast.start.end, value: forecast.start.cash }, ...c.path.map((p) => ({ end: p.end, value: p.cash }))],
            }))}
            format={compactMoney}
            change="diff"
            quarterLabel={label}
            reference={{ value: 0, label: "Below this line the cash has run out" }}
            hideSummary
            height={240}
            note={`Starts from actual cash of ${compactMoney(forecast.start.cash)} at ${forecast.start.end} (${label(forecast.start.end)}).`}
          />

          <div className="mt-4 overflow-x-auto rounded-xs border border-zinc-800">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-zinc-900 text-[10px] uppercase tracking-wider text-zinc-500">
                  <th scope="col" className="px-4 py-2 font-semibold">Case</th>
                  <th scope="col" className="px-4 py-2 font-semibold">Free cash flow per quarter</th>
                  <th scope="col" className="px-4 py-2 font-semibold">Debt principal due, {forecast.quarters} quarters</th>
                  <th scope="col" className="px-4 py-2 font-semibold">Cash after {forecast.quarters} quarters</th>
                  <th scope="col" className="px-4 py-2 font-semibold">Cash runs out</th>
                </tr>
              </thead>
              <tbody>
                {forecast.cases.map((c) => (
                  <tr key={c.key} className="border-t border-zinc-800 align-top">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 font-medium text-zinc-100">
                        <span className="h-2 w-2 rounded-[1px]" style={{ background: COLORS[c.key] }} aria-hidden />
                        {c.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-zinc-500">The company&rsquo;s {c.assumption}</span>
                    </td>
                    <td className={`px-4 py-3 font-mono ${c.quarterlyFcf < 0 ? "text-red-400" : "text-zinc-100"}`}>{compactMoney(c.quarterlyFcf)}</td>
                    <td className="px-4 py-3 font-mono text-zinc-300">{compactMoney(forecast.debtDue)}</td>
                    <td className={`px-4 py-3 font-mono ${c.endingCash < 0 ? "text-red-400" : "text-zinc-100"}`}>{compactMoney(c.endingCash)}</td>
                    <td className={`px-4 py-3 font-mono ${c.runsOutAt ? "text-red-400" : "text-emerald-400"}`}>
                      {c.runsOutAt ? `${label(c.runsOutAt)} (${c.runsOutAt})` : `Not within ${forecast.quarters} quarters`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
            Free cash flow is operating cash flow less capital spending, from XBRL; interest paid is already inside operating cash flow. Debt due is the
            debt note&rsquo;s maturity table, spread over the quarters of each year.
            {forecast.undrawn ? ` An undrawn credit line of ${compactMoney(forecast.undrawn)} is not counted; drawing it would add that much cash.` : ""} These
            are scenarios built from what has already happened, not predictions.
          </p>
        </>
      )}
    </section>
  );
}
