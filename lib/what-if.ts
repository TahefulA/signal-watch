import type { ScenarioInputs } from "@/types";
import { buildForecast } from "./forecast";

/**
 * What-if scenarios on the cash forecast, run in code. Each one changes a
 * single assumption of the base case (the average of the last four quarters
 * repeats, debt paid from cash as the debt note schedules it) and runs the
 * same forecast again. Nothing is estimated by a model.
 */

export interface WhatIf {
  /** Share by which quarterly free cash flow gets worse: 0.25 takes a quarter of its size off. */
  fcfShock: number;
  /** Fed funds upper bound applied to floating-rate debt, in percent. */
  upper: number | null;
  /** Count the undrawn revolver as cash available today. */
  drawRevolver: boolean;
  /** Scheduled maturities are refinanced rather than paid from cash. */
  refinance: boolean;
}

export interface WhatIfResult {
  quarterlyFcf: number;
  extraInterest: number;
  runsOutAt: string | null;
  endingCash: number;
  startCash: number;
  startEnd: string;
  debtDue: number;
  quarters: number;
  path: { end: string; cash: number; debtDue: number }[];
  /** The changed assumptions, in words. */
  changes: string[];
}

export const BASE_WHAT_IF: WhatIf = { fcfShock: 0, upper: null, drawRevolver: false, refinance: false };

const money = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1e9 ? `$${(a / 1e9).toFixed(2)} billion` : a >= 1e6 ? `$${(a / 1e6).toFixed(1)} million` : `$${Math.round(a).toLocaleString()}`;
  return v < 0 ? `-${s}` : s;
};

export function runWhatIf(inputs: ScenarioInputs, w: WhatIf): WhatIfResult | null {
  const recent = inputs.fcf.slice(-4);
  if (recent.length < 2 || !inputs.cash.length) return null;
  const average = recent.reduce((s, p) => s + p.value, 0) / recent.length;
  const delta = w.upper !== null && inputs.currentUpper !== null ? w.upper - inputs.currentUpper : 0;
  const extraInterest = (inputs.floatingDebt * delta) / 100;
  const shift = Math.abs(average) * w.fcfShock + extraInterest / 4;
  const cash = w.drawRevolver && inputs.undrawn > 0 ? inputs.cash.map((c, i, a) => (i === a.length - 1 ? { ...c, value: c.value + inputs.undrawn } : c)) : inputs.cash;
  const forecast = buildForecast({ fcf: inputs.fcf.map((p) => ({ end: p.end, value: p.value - shift })), cash, schedule: w.refinance ? null : inputs.schedule });
  const base = forecast?.cases.find((c) => c.key === "base");
  if (!forecast || !base) return null;

  const changes: string[] = [];
  if (w.fcfShock) changes.push(`free cash flow ${money(Math.abs(average) * w.fcfShock)} a quarter worse than the recent average (${Math.round(w.fcfShock * 100)}% of its size)`);
  if (delta && inputs.floatingDebt > 0) changes.push(`the Fed upper bound at ${w.upper?.toFixed(2)}%, adding ${money(extraInterest)} a year of interest on ${money(inputs.floatingDebt)} of floating-rate debt`);
  else if (delta) changes.push(`the Fed upper bound at ${w.upper?.toFixed(2)}%, which changes nothing: no floating-rate debt is named in the debt note`);
  if (w.drawRevolver) changes.push(inputs.undrawn > 0 ? `the ${money(inputs.undrawn)} undrawn revolver drawn in full today` : "the revolver drawn, but the debt note shows no undrawn commitment");
  if (w.refinance) changes.push("every scheduled maturity refinanced instead of paid from cash");
  return {
    quarterlyFcf: base.quarterlyFcf,
    extraInterest,
    runsOutAt: base.runsOutAt,
    endingCash: base.endingCash,
    startCash: forecast.start.cash,
    startEnd: forecast.start.end,
    debtDue: w.refinance ? 0 : forecast.debtDue,
    quarters: forecast.quarters,
    path: base.path,
    changes,
  };
}

/** One sentence a committee member can be asked to argue over, with code's numbers in it. */
export function describeWhatIf(r: WhatIfResult, base: WhatIfResult | null): string {
  const what = r.changes.length ? r.changes.join("; ") : "nothing changed from the base case";
  const outcome = r.runsOutAt ? `cash runs out in the quarter ending ${r.runsOutAt}` : `cash lasts the ${r.quarters} quarters projected, ending at ${money(r.endingCash)}`;
  const versus = base ? (base.runsOutAt ? ` (base case: runs out ${base.runsOutAt})` : ` (base case: lasts, ending at ${money(base.endingCash)})`) : "";
  return `Scenario run by code from ${r.startEnd} cash of ${money(r.startCash)}: ${what}. Result: quarterly free cash flow of ${money(r.quarterlyFcf)}, and ${outcome}${versus}.`;
}
