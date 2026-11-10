import type { CapitalStructure, RateScenario, RateStress } from "@/types";
import { CAPEX, CASH, OPERATING_CASH } from "./capital";
import { buildForecast } from "./forecast";
import { type FedPath, meetingNear } from "./kalshi";
import { type FactBook, type SeriesPoint, instantSeries, quarterlySeries } from "./xbrl";

/**
 * What the prediction market's rate path costs one borrower. Floating-rate
 * debt comes from the debt note; the rate path comes from Kalshi's Fed
 * markets; the cash forecast is the existing base case (the company's average
 * recent quarter repeats). Each scenario lowers quarterly free cash flow by
 * the extra interest and runs the same forecast again. Nothing here is
 * estimated by a model.
 */

/** A coupon or name that floats: SOFR, LIBOR, prime or a base rate. */
export const FLOATING = /SOFR|LIBOR|floating|variable|base rate|prime/i;

export function floatingDebt(capital: CapitalStructure | null | undefined): { floating: number; total: number } {
  const debt = (capital?.instruments ?? []).filter((i) => i.outstanding && !i.aggregate);
  const total = debt.reduce((s, i) => s + (i.outstanding ?? 0), 0);
  const floating = debt.filter((i) => FLOATING.test(`${i.coupon ?? ""} ${i.name}`)).reduce((s, i) => s + (i.outstanding ?? 0), 0);
  return { floating, total };
}

/** Quarterly free cash flow and quarter-end cash through a date, from XBRL. */
export function cashHistory(book: FactBook, through: string): { fcf: SeriesPoint[]; cash: SeriesPoint[] } {
  const ocf = quarterlySeries(book, OPERATING_CASH, through, 12);
  const capex = quarterlySeries(book, CAPEX, through, 12);
  const fcf = ocf
    .map((o) => {
      const c = capex.find((x) => x.end === o.end);
      return c ? { end: o.end, value: o.value - c.value } : null;
    })
    .filter((p): p is SeriesPoint => p !== null);
  return { fcf, cash: instantSeries(book, CASH, through, 12) };
}

export function rateStress(capital: CapitalStructure | null | undefined, book: FactBook | null, path: FedPath, today: string): RateStress {
  const { floating, total } = floatingDebt(capital);
  const meeting = meetingNear(path, today, 365);
  const base: Omit<RateStress, "scenarios" | "note"> = {
    floatingDebt: floating,
    totalDebt: total,
    floatingShare: total > 0 ? floating / total : null,
    currentUpper: path.currentUpper,
    currentAsOf: path.currentAsOf,
    meeting: meeting
      ? { event: meeting.event, date: meeting.date, expectedUpper: meeting.expectedUpper, stressUpper: meeting.stressUpper, pHike: meeting.pHike, pCut: meeting.pCut, url: meeting.url, widestGap: meeting.widestGap }
      : null,
    fetchedAt: path.fetchedAt,
  };
  if (!meeting || path.currentUpper === null) return { ...base, scenarios: [], note: "Kalshi's Fed markets did not have enough liquid prices to read a rate path." };
  if (!capital?.asOf || !book) return { ...base, scenarios: [], note: "The report has no financial snapshot to run the cash forecast from." };

  const { fcf, cash } = cashHistory(book, capital.asOf);
  const schedule = capital.maturitySchedule?.rows ?? null;
  const current = path.currentUpper;
  const cases: { key: RateScenario["key"]; label: string; upper: number; how: string }[] = [
    { key: "hold", label: "Rates stay where they are", upper: current, how: `upper bound stays at ${current.toFixed(2)}%` },
    {
      key: "market",
      label: "The market's expected path",
      upper: meeting.expectedUpper,
      how: `expected upper bound after the ${meeting.date} meeting, from Kalshi prices: ${meeting.expectedUpper.toFixed(2)}%`,
    },
    {
      key: "stress",
      label: "The market's stress case",
      upper: meeting.stressUpper,
      how: `90th percentile of Kalshi's distribution for the ${meeting.date} meeting: ${meeting.stressUpper.toFixed(2)}%`,
    },
  ];
  const scenarios: RateScenario[] = [];
  for (const c of cases) {
    const delta = c.upper - current;
    const extraInterest = (floating * delta) / 100;
    const shifted = fcf.map((p) => ({ end: p.end, value: p.value - extraInterest / 4 }));
    const forecast = buildForecast({ fcf: shifted, cash, schedule });
    const baseCase = forecast?.cases.find((x) => x.key === "base") ?? null;
    scenarios.push({
      key: c.key,
      label: c.label,
      how: c.how,
      upper: c.upper,
      deltaPoints: delta,
      extraInterest,
      quarterlyFcf: baseCase?.quarterlyFcf ?? null,
      runsOutAt: baseCase?.runsOutAt ?? null,
      endingCash: baseCase?.endingCash ?? null,
      quarters: forecast?.quarters ?? null,
      startCash: forecast?.start.cash ?? null,
      startEnd: forecast?.start.end ?? null,
    });
  }
  const note =
    floating === 0
      ? "No instrument in the debt note names a floating rate, so the rate path does not change interest cost."
      : fcf.length < 2
        ? "Free cash flow is not tagged for enough quarters to run the forecast."
        : null;
  return { ...base, scenarios, note };
}
