"use client";

import { MessageSquare } from "lucide-react";
import { useMemo, useState } from "react";
import type { ScenarioInputs } from "@/types";
import { BASE_WHAT_IF, type WhatIf, describeWhatIf, runWhatIf } from "@/lib/what-if";
import { compactMoney } from "@/lib/node-visuals";

interface Preset {
  label: string;
  hint: string;
  apply: (i: ScenarioInputs) => WhatIf;
}

const PRESETS: Preset[] = [
  { label: "Base case", hint: "Recent average quarter repeats", apply: () => BASE_WHAT_IF },
  { label: "Business 25% worse", hint: "Cash flow a quarter worse than recent", apply: () => ({ ...BASE_WHAT_IF, fcfShock: 0.25 }) },
  { label: "Fed stress path", hint: "Kalshi's 90th percentile rate", apply: (i) => ({ ...BASE_WHAT_IF, upper: i.stressUpper ?? i.currentUpper }) },
  { label: "Revolver drawn", hint: "Every undrawn dollar taken today", apply: () => ({ ...BASE_WHAT_IF, drawRevolver: true }) },
  { label: "Maturities refinanced", hint: "Lenders roll everything due", apply: () => ({ ...BASE_WHAT_IF, refinance: true }) },
  { label: "Bad year", hint: "50% worse, Fed stress, no refinancing", apply: (i) => ({ fcfShock: 0.5, upper: i.stressUpper ?? i.currentUpper, drawRevolver: false, refinance: false }) },
];

const same = (a: WhatIf, b: WhatIf) => a.fcfShock === b.fcfShock && a.upper === b.upper && a.drawRevolver === b.drawRevolver && a.refinance === b.refinance;

/**
 * What if: change one assumption of the cash forecast and see the runway move.
 * Everything here is arithmetic on filed figures and Kalshi's rate path; the
 * committee can then be asked to argue over the result, which it receives as
 * evidence the server reruns itself.
 */
export function WhatIfPanel({ inputs, onAsk, asking }: { inputs: ScenarioInputs; onAsk: (question: string, w: WhatIf) => void; asking: boolean }) {
  const [w, setW] = useState<WhatIf>(BASE_WHAT_IF);
  const base = useMemo(() => runWhatIf(inputs, BASE_WHAT_IF), [inputs]);
  const result = useMemo(() => runWhatIf(inputs, w), [inputs, w]);
  if (!base || !result) return null;

  const current = inputs.currentUpper;
  const upper = w.upper ?? current;
  const peak = Math.max(result.startCash, ...result.path.map((p) => Math.abs(p.cash)), 1);
  const sooner = base.runsOutAt !== result.runsOutAt;
  const question = result.changes.length ? `What if ${result.changes.join(", and ")}?` : "In the base case, what keeps the cash from running out?";

  return (
    <section className="surface mt-8 rounded-xs border border-zinc-800 p-4" data-tour="what-if">
      <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        <span className="h-1.5 w-1.5 rounded-[1px] bg-red-600" aria-hidden /> What if
      </h3>
      <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-zinc-400">
        Change one assumption and the cash forecast reruns from the filed figures. Code does every number here; the committee can be asked to argue over the result.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {PRESETS.map((p) => {
          const applied = p.apply(inputs);
          return (
            <button
              key={p.label}
              type="button"
              title={p.hint}
              onClick={() => setW(applied)}
              className={`rounded-xs border px-2.5 py-1 text-xs ${same(applied, w) ? "border-zinc-400 bg-zinc-800 text-zinc-50" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"}`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4 text-xs text-zinc-300">
          <label className="block">
            <span className="flex justify-between">
              <span>Free cash flow worse by</span>
              <span className="font-mono text-zinc-100">{Math.round(w.fcfShock * 100)}%</span>
            </span>
            <input type="range" min={0} max={1} step={0.05} value={w.fcfShock} onChange={(e) => setW({ ...w, fcfShock: Number(e.target.value) })} className="mt-1 w-full accent-red-600" />
          </label>
          {current !== null ? (
            <label className="block">
              <span className="flex justify-between">
                <span>Fed funds upper bound</span>
                <span className="font-mono text-zinc-100">
                  {upper?.toFixed(2)}%{inputs.floatingDebt > 0 ? "" : " (no floating debt)"}
                </span>
              </span>
              <input
                type="range"
                min={Math.max(0, current - 2)}
                max={current + 3}
                step={0.25}
                value={upper ?? current}
                onChange={(e) => setW({ ...w, upper: Number(e.target.value) === current ? null : Number(e.target.value) })}
                className="mt-1 w-full accent-red-600"
              />
              <span className="mt-0.5 block text-[10px] text-zinc-500">
                Today {current.toFixed(2)}%
                {inputs.expectedUpper !== null ? ` · Kalshi expects ${inputs.expectedUpper.toFixed(2)}%` : ""}
                {inputs.stressUpper !== null ? ` · stress ${inputs.stressUpper.toFixed(2)}%` : ""}
                {inputs.meetingDate ? ` after ${inputs.meetingDate}` : ""}
              </span>
            </label>
          ) : null}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={w.drawRevolver} onChange={(e) => setW({ ...w, drawRevolver: e.target.checked })} className="accent-red-600" />
            Draw the undrawn revolver today ({inputs.undrawn > 0 ? compactMoney(inputs.undrawn) : "none in the debt note"})
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={w.refinance} onChange={(e) => setW({ ...w, refinance: e.target.checked })} className="accent-red-600" />
            Refinance every scheduled maturity instead of paying it from cash
          </label>
        </div>

        <div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Cash runs out</p>
              <p className={`font-mono text-lg font-semibold ${result.runsOutAt ? "text-red-500" : "text-emerald-500"}`}>{result.runsOutAt ?? `Not in ${result.quarters} qtrs`}</p>
              <p className="text-[10px] text-zinc-500">{sooner ? `Base case: ${base.runsOutAt ?? `not in ${base.quarters} qtrs`}` : "Same as the base case"}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Cash after {result.quarters} quarters</p>
              <p className={`font-mono text-lg font-semibold ${result.endingCash < 0 ? "text-red-500" : "text-zinc-50"}`}>{compactMoney(result.endingCash)}</p>
              <p className="text-[10px] text-zinc-500">
                {compactMoney(result.quarterlyFcf)} a quarter{result.extraInterest ? ` · +${compactMoney(result.extraInterest)}/yr interest` : ""}
              </p>
            </div>
          </div>
          {/* Cash at each projected quarter end; below the line means the cash is gone. */}
          <div className="mt-3 flex h-24 items-center gap-1" role="img" aria-label={`Projected cash by quarter: ${result.path.map((p) => `${p.end} ${compactMoney(p.cash)}`).join(", ")}`}>
            {result.path.map((p) => (
              <div key={p.end} className="flex h-full flex-1 flex-col" title={`${p.end}: ${compactMoney(p.cash)}${p.debtDue ? `, ${compactMoney(p.debtDue)} principal due` : ""}`}>
                <div className="flex flex-1 items-end">
                  {p.cash > 0 ? <div className="w-full rounded-t-[3px]" style={{ height: `${(p.cash / peak) * 100}%`, background: "var(--series-1)" }} /> : null}
                </div>
                <div className="h-px bg-zinc-600" />
                <div className="flex flex-1 items-start">{p.cash < 0 ? <div className="w-full rounded-b-[3px] bg-red-600" style={{ height: `${(Math.abs(p.cash) / peak) * 100}%` }} /> : null}</div>
              </div>
            ))}
          </div>
          <p className="mt-1 flex justify-between font-mono text-[10px] text-zinc-500">
            <span>{result.path[0]?.end}</span>
            <span>{result.path.at(-1)?.end}</span>
          </p>
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">{describeWhatIf(result, base)}</p>
      <button
        type="button"
        disabled={asking}
        onClick={() => onAsk(question.slice(0, 400), w)}
        className="mt-3 inline-flex items-center gap-1.5 rounded-xs border border-zinc-600 px-3 py-1.5 text-xs text-zinc-200 hover:border-zinc-400 disabled:opacity-40"
      >
        <MessageSquare className="h-3.5 w-3.5" aria-hidden /> {asking ? "Asking the committee" : "Ask the committee about this scenario"}
      </button>
    </section>
  );
}
