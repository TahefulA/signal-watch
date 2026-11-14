"use client";

import { ExternalLink } from "lucide-react";
import type { RateStress } from "@/types";
import { compactMoney } from "@/lib/node-visuals";

/** Kalshi's Fed odds applied to this borrower: extra interest on floating debt and the base-case cash runway. */
export function RateStressPanel({ stress }: { stress: RateStress }) {
  const m = stress.meeting;
  return (
    <section className="surface rounded-xs border border-zinc-800 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Prediction market: the Fed rate path</p>
      {m && stress.currentUpper !== null ? (
        <>
          <p className="mt-2 text-[13px] leading-relaxed text-zinc-300">
            Kalshi prices a <span className="font-mono text-zinc-50">{Math.round(m.pHike * 100)}%</span> chance the federal funds upper bound is above{" "}
            <span className="font-mono">{stress.currentUpper.toFixed(2)}%</span> after the {m.date} meeting, and a{" "}
            <span className="font-mono">{Math.round(m.pCut * 100)}%</span> chance it is lower. Expected: <span className="font-mono text-zinc-50">{m.expectedUpper.toFixed(2)}%</span>; 90th percentile{" "}
            <span className="font-mono">{m.stressUpper.toFixed(2)}%</span>.
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Floating-rate debt: {stress.floatingDebt > 0 ? `${compactMoney(stress.floatingDebt)} of ${compactMoney(stress.totalDebt)}` : "none named in the debt note"}.
          </p>
        </>
      ) : null}
      {stress.scenarios.length && stress.floatingDebt > 0 ? (
        <table className="mt-3 w-full text-left text-xs">
          <thead className="text-zinc-500">
            <tr>
              <th className="py-1 pr-2 font-medium">Case</th>
              <th className="py-1 pr-2 font-medium">Upper bound</th>
              <th className="py-1 pr-2 font-medium">Extra interest / yr</th>
              <th className="py-1 font-medium">Cash runs out</th>
            </tr>
          </thead>
          <tbody className="text-zinc-300">
            {stress.scenarios.map((s) => (
              <tr key={s.key} className="border-t border-zinc-800/60" title={s.how}>
                <td className="py-1.5 pr-2">{s.label}</td>
                <td className="py-1.5 pr-2 font-mono">{s.upper.toFixed(2)}%</td>
                <td className="py-1.5 pr-2 font-mono">{compactMoney(s.extraInterest)}</td>
                <td className={`py-1.5 font-mono ${s.runsOutAt ? "text-red-500" : "text-zinc-400"}`}>{s.runsOutAt ?? `Not in ${s.quarters ?? 8} quarters`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {stress.note ? <p className="mt-2 text-xs text-zinc-500">{stress.note}</p> : null}
      <p className="mt-3 text-xs leading-relaxed text-zinc-500">
        Probabilities are bid-ask midpoints on Kalshi&rsquo;s KXFED ladder; strikes with a spread above 15 cents are skipped and interpolated
        {m && m.widestGap > 0.25 ? ` (widest gap here: ${m.widestGap.toFixed(2)} points)` : ""}. Runway is the base cash case (average recent quarter repeats) less the extra interest. Read{" "}
        {stress.fetchedAt.slice(0, 10)}.
        {m ? (
          <a href={m.url} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-0.5 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-200">
            Kalshi <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ) : null}
      </p>
    </section>
  );
}
