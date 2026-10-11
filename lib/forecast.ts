/**
 * Forecasting (Gatto's Step 4) without letting the AI invent future numbers.
 * Three cases, each repeating something the company has already done:
 *   Strong    its best quarter of free cash flow in the last eight
 *   Base      its average quarter over the last four
 *   Downside  its worst quarter in the last eight
 * Cash is carried forward quarter by quarter for two years, less debt
 * principal in the periods the debt note says it is due. No new borrowing or
 * share sales are assumed, so the result answers "how long does the cash last
 * on its own?". Every input comes from XBRL or the debt note, and every
 * assumption is returned as text so it can be shown beside the result.
 * These are scenarios, not predictions.
 */

export interface ForecastPoint {
  end: string;
  value: number;
}

export interface ForecastInput {
  /** Quarterly free cash flow (operating cash flow less capital spending), oldest first. */
  fcf: ForecastPoint[];
  /** Quarter-end cash, oldest first. */
  cash: ForecastPoint[];
  /** Principal maturities from the debt note: "Remainder of 2026", "2027", "Thereafter". */
  schedule: { period: string; amount: number }[] | null;
  /** Undrawn credit line, when the filing states it. Shown, not counted. */
  undrawn?: number | null;
  /** Quarters to project. */
  quarters?: number;
}

export type CaseKey = "strong" | "base" | "downside";

export interface ForecastCase {
  key: CaseKey;
  label: string;
  /** How the quarterly free cash flow was chosen, in words. */
  assumption: string;
  quarterlyFcf: number;
  /** Projected quarter ends with cash after that quarter and the principal paid in it. */
  path: { end: string; cash: number; debtDue: number }[];
  /** First projected quarter end at which cash is below zero, or null. */
  runsOutAt: string | null;
  endingCash: number;
}

export interface Forecast {
  start: { end: string; cash: number };
  cases: ForecastCase[];
  /** Principal due inside the projection window. */
  debtDue: number;
  quarters: number;
  undrawn: number | null;
}

/** The last day of the month three months after this quarter end. */
function nextQuarterEnd(end: string): string {
  const d = new Date(`${end}T00:00:00Z`);
  const month = d.getUTCMonth() + 3;
  const last = new Date(Date.UTC(d.getUTCFullYear(), month + 1, 0));
  return last.toISOString().slice(0, 10);
}

/** Principal due in each projected quarter: a year's amount is spread over that year's projected quarters. */
function debtByQuarter(ends: string[], schedule: ForecastInput["schedule"]): number[] {
  const due = ends.map(() => 0);
  for (const row of schedule ?? []) {
    const year = row.period.match(/^(?:Remainder of )?(20\d\d)$/i)?.[1];
    if (!year) continue;
    const inYear = ends.map((e, i) => (e.startsWith(year) ? i : -1)).filter((i) => i >= 0);
    for (const i of inYear) due[i] += row.amount / inYear.length;
  }
  return due;
}

export function buildForecast({ fcf, cash, schedule, undrawn = null, quarters = 8 }: ForecastInput): Forecast | null {
  const start = cash.at(-1);
  const recent8 = fcf.slice(-8);
  const recent4 = fcf.slice(-4);
  if (!start || recent4.length < 2) return null;

  const ends: string[] = [];
  for (let e = start.end, i = 0; i < quarters; i++) {
    e = nextQuarterEnd(e);
    ends.push(e);
  }
  const due = debtByQuarter(ends, schedule);
  const best = recent8.reduce((a, b) => (b.value > a.value ? b : a));
  const worst = recent8.reduce((a, b) => (b.value < a.value ? b : a));
  const average = recent4.reduce((s, p) => s + p.value, 0) / recent4.length;

  const run = (key: CaseKey, label: string, assumption: string, quarterlyFcf: number): ForecastCase => {
    let balance = start.value;
    let runsOutAt: string | null = null;
    const path = ends.map((end, i) => {
      balance += quarterlyFcf - due[i];
      if (balance < 0 && !runsOutAt) runsOutAt = end;
      return { end, cash: balance, debtDue: due[i] };
    });
    return { key, label, assumption, quarterlyFcf, path, runsOutAt, endingCash: balance };
  };

  return {
    start: { end: start.end, cash: start.value },
    cases: [
      run("strong", "Strong case", `best quarter of the last ${recent8.length} (quarter ended ${best.end}) repeats`, best.value),
      run("base", "Base case", `average over the last ${recent4.length} quarters repeats`, average),
      run("downside", "Downside case", `worst quarter of the last ${recent8.length} (quarter ended ${worst.end}) repeats`, worst.value),
    ],
    debtDue: due.reduce((s, x) => s + x, 0),
    quarters,
    undrawn,
  };
}
