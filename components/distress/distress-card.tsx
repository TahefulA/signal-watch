"use client";

import { useState } from "react";
import type { DistressBand, DistressScore } from "@/types";

export const BAND_STYLE: Record<DistressBand, { text: string; bg: string; label: string }> = {
  low: { text: "text-emerald-500", bg: "bg-emerald-600", label: "Low" },
  elevated: { text: "text-amber-500", bg: "bg-amber-500", label: "Elevated" },
  high: { text: "text-red-500", bg: "bg-red-600", label: "High" },
  severe: { text: "text-red-400", bg: "bg-red-700", label: "Severe" },
};

export const pctText = (p: number) => `${(p * 100).toFixed(p < 0.01 ? 2 : 1)}%`;

/** The probability, what moves it, and every filed figure behind it with the day it became public. */
export function DistressCard({ distress }: { distress: DistressScore }) {
  const [inputs, setInputs] = useState(false);
  const style = BAND_STYLE[distress.band];
  const times = distress.probability / distress.baseRate;
  return (
    <section className="surface rounded-xs border border-zinc-800 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">12-month bankruptcy probability</p>
      <div className="mt-2 flex items-baseline gap-3">
        <span className={`font-mono text-3xl font-bold ${style.text}`}>{pctText(distress.probability)}</span>
        <span className={`rounded-xs px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white ${style.bg}`}>{style.label}</span>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        {times >= 1 ? `${times.toFixed(1)} times` : `${(1 / times).toFixed(1)} times below`} the {pctText(distress.baseRate)} average across the training universe.
        {distress.zScore !== null ? ` Altman Z'' ${distress.zScore.toFixed(2)} (${distress.zZone} zone).` : ""}
      </p>
      {distress.reasons.length ? (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-red-500">Pushes it up</p>
          <ul className="mt-1 space-y-0.5 text-xs text-zinc-300">
            {distress.reasons.map((r) => (
              <li key={r.feature} className="flex justify-between gap-3">
                <span>{r.label}</span>
                <span className="shrink-0 font-mono text-zinc-400">{r.display}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {distress.offsets.length ? (
        <div className="mt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-500">Holds it down</p>
          <ul className="mt-1 space-y-0.5 text-xs text-zinc-300">
            {distress.offsets.map((r) => (
              <li key={r.feature} className="flex justify-between gap-3">
                <span>{r.label}</span>
                <span className="shrink-0 font-mono text-zinc-400">{r.display}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-3 text-xs leading-relaxed text-zinc-500">
        Gradient-boosted trees trained on SEC filings and bankruptcy 8-Ks through {distress.trainedThrough}. Code computes it; the AI only argues over it.{" "}
        <a href="/proof" className="text-zinc-300 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-50">
          See the backtest
        </a>
      </p>
      <button type="button" onClick={() => setInputs((o) => !o)} className="mt-2 text-xs text-zinc-400 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-100">
        {inputs ? "Hide" : "Show"} the {distress.inputs.length} filed figures used {distress.leakFree ? "(all filed before today)" : "(check dates)"}
      </button>
      {inputs ? (
        <table className="mt-2 w-full text-left text-xs">
          <thead className="text-zinc-500">
            <tr>
              <th className="py-1 pr-2 font-medium">Figure</th>
              <th className="py-1 pr-2 font-medium">Period</th>
              <th className="py-1 font-medium">Filed</th>
            </tr>
          </thead>
          <tbody className="text-zinc-300">
            {distress.inputs.map((i) => (
              <tr key={i.label} className="border-t border-zinc-800/60">
                <td className="py-1 pr-2">
                  <a href={i.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {i.label.replace(/ \(.*\)$/, "")}
                  </a>
                </td>
                <td className="py-1 pr-2 font-mono text-zinc-500">{i.periodEnd}</td>
                <td className={`py-1 font-mono ${i.filed < distress.asOf ? "text-zinc-400" : "text-red-500"}`}>{i.filed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
