import type { XbrlValue } from "@/types";
import { CASH, INTEREST, OPERATING_CASH, OPERATING_INCOME, REVENUE } from "./capital";
import { addDays, daysBetween } from "./dates";
import { type DatedInput, bookAsOf } from "./pit";
import { type FactBook, instantAt, latestInstantDate, trailingTwelveMonths } from "./xbrl";

/**
 * The distress model's inputs, built from a company's own XBRL as of a date.
 * The live score and the backtest call the same function, so the backtest
 * measures exactly what the app shows. Every ratio is plain arithmetic on
 * tagged figures; a ratio whose inputs are not tagged is null.
 */

export const FEATURES = [
  "log_assets",
  "wc_ta",
  "re_ta",
  "ebit_ta",
  "eq_tl",
  "tl_ta",
  "cash_ta",
  "ni_ta",
  "ocf_tl",
  "int_cov",
  "rev_growth",
  "cash_change",
  "filing_lag",
] as const;

export type FeatureName = (typeof FEATURES)[number];

export const FEATURE_LABELS: Record<FeatureName, string> = {
  log_assets: "Company size (log of total assets)",
  wc_ta: "Working capital to total assets",
  re_ta: "Retained earnings to total assets",
  ebit_ta: "Operating income to total assets",
  eq_tl: "Book equity to total liabilities",
  tl_ta: "Total liabilities to total assets",
  cash_ta: "Cash to total assets",
  ni_ta: "Net income to total assets",
  ocf_tl: "Operating cash flow to total liabilities",
  int_cov: "Operating income to interest expense",
  rev_growth: "Revenue growth over a year",
  cash_change: "Change in cash over a year",
  filing_lag: "Months filed past the usual deadline",
};

const ASSETS = ["Assets"];
const LIABILITIES = ["Liabilities"];
const EQUITY = ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"];
const CURRENT_ASSETS = ["AssetsCurrent"];
const CURRENT_LIABILITIES = ["LiabilitiesCurrent"];
const RETAINED = ["RetainedEarningsAccumulatedDeficit"];
const NET_INCOME = ["NetIncomeLoss", "ProfitLoss"];
const LIABILITIES_AND_EQUITY = ["LiabilitiesAndStockholdersEquity"];

/** Every concept the features read; the dataset builder trims each company's facts to these first. */
export const FEATURE_CONCEPTS = [
  ...ASSETS,
  ...LIABILITIES,
  ...EQUITY,
  ...CURRENT_ASSETS,
  ...CURRENT_LIABILITIES,
  ...RETAINED,
  ...NET_INCOME,
  ...LIABILITIES_AND_EQUITY,
  ...CASH,
  ...OPERATING_INCOME,
  ...OPERATING_CASH,
  ...INTEREST,
  ...REVENUE,
];

/** Days after period end a filing is normally made: about 90 for a 10-K and 45 for a 10-Q. */
function deadline(form: string): number {
  return form.startsWith("10-K") ? 90 : 45;
}

export interface FeatureRow {
  asOf: string;
  /** Balance sheet date the row describes. */
  periodEnd: string;
  values: Record<FeatureName, number | null>;
  /** Altman Z'' (book-equity version, no stock price needed): the published baseline. */
  zScore: number | null;
  /** Every tagged figure used, with its filing date, for the leakage audit. */
  inputs: DatedInput[];
}

function clip(x: number | null, lo: number, hi: number): number | null {
  return x === null || !Number.isFinite(x) ? null : Math.min(hi, Math.max(lo, x));
}

function ratio(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a === null || a === undefined || b === null || b === undefined || b === 0) return null;
  return a / b;
}

/** Altman Z'' for non-manufacturers and private firms (Altman 1995). Below 1.1 is the published distress zone. */
export function altmanZ(v: Pick<Record<FeatureName, number | null>, "wc_ta" | "re_ta" | "ebit_ta" | "eq_tl">): number | null {
  if (v.wc_ta === null || v.re_ta === null || v.ebit_ta === null || v.eq_tl === null) return null;
  return 6.56 * v.wc_ta + 3.26 * v.re_ta + 6.72 * v.ebit_ta + 1.05 * Math.min(v.eq_tl, 10);
}

/** Features as of a date, or null when no balance sheet was filed before it. */
export function buildFeatures(fullBook: FactBook, cik: string, asOf: string): FeatureRow | null {
  const book = bookAsOf(fullBook, asOf);
  const end = latestInstantDate(book, ASSETS);
  if (!end) return null;

  const inputs: DatedInput[] = [];
  const use = (label: string, v: XbrlValue | null): number | null => {
    if (!v) return null;
    inputs.push({ label: `${label} (${v.concept})`, value: v.value, periodEnd: end, filed: v.filed, url: v.url });
    return v.value;
  };

  const assetsValue = instantAt(book, cik, ASSETS, end);
  const assets = use("Total assets", assetsValue);
  if (!assetsValue || !assets || assets <= 0) return null;
  const equity = use("Stockholders' equity", instantAt(book, cik, EQUITY, end));
  let liabilities = use("Total liabilities", instantAt(book, cik, LIABILITIES, end));
  if (liabilities === null && equity !== null) {
    const total = use("Liabilities and equity", instantAt(book, cik, LIABILITIES_AND_EQUITY, end));
    if (total !== null) liabilities = total - equity;
  }
  const currentAssets = use("Current assets", instantAt(book, cik, CURRENT_ASSETS, end));
  const currentLiabilities = use("Current liabilities", instantAt(book, cik, CURRENT_LIABILITIES, end));
  const retained = use("Retained earnings", instantAt(book, cik, RETAINED, end));
  const cash = use("Cash", instantAt(book, cik, CASH, end));
  const ebit = use("Operating income, trailing 12 months", trailingTwelveMonths(book, cik, OPERATING_INCOME, end));
  const netIncome = use("Net income, trailing 12 months", trailingTwelveMonths(book, cik, NET_INCOME, end));
  const ocf = use("Operating cash flow, trailing 12 months", trailingTwelveMonths(book, cik, OPERATING_CASH, end));
  const interest = use("Interest expense, trailing 12 months", trailingTwelveMonths(book, cik, INTEREST, end));
  const revenue = use("Revenue, trailing 12 months", trailingTwelveMonths(book, cik, REVENUE, end));

  // The same figures a year earlier, from the balance sheet date closest to 365 days before.
  const yearAgo = priorEnd(book, end);
  const revenuePrior = yearAgo ? use("Revenue, prior trailing 12 months", trailingTwelveMonths(book, cik, REVENUE, yearAgo)) : null;
  const cashPrior = yearAgo ? use("Cash a year earlier", instantAt(book, cik, CASH, yearAgo)) : null;

  const values: Record<FeatureName, number | null> = {
    log_assets: Math.log(assets / 1e6 + 1),
    wc_ta: clip(ratio(currentAssets !== null && currentLiabilities !== null ? currentAssets - currentLiabilities : null, assets), -2, 1),
    re_ta: clip(ratio(retained, assets), -5, 1),
    ebit_ta: clip(ratio(ebit, assets), -2, 1),
    eq_tl: clip(ratio(equity, liabilities), -2, 10),
    tl_ta: clip(ratio(liabilities, assets), 0, 3),
    cash_ta: clip(ratio(cash, assets), 0, 1),
    ni_ta: clip(ratio(netIncome, assets), -2, 1),
    ocf_tl: clip(ratio(ocf, liabilities), -2, 2),
    int_cov: clip(ratio(ebit, interest), -10, 20),
    rev_growth: clip(revenue !== null && revenuePrior ? revenue / revenuePrior - 1 : null, -1, 2),
    cash_change: clip(cash !== null && cashPrior ? cash / cashPrior - 1 : null, -1, 3),
    filing_lag: clip((daysBetween(end, assetsValue.filed) - deadline(assetsValue.form)) / 30.44, -3, 24),
  };
  return { asOf, periodEnd: end, values, zScore: altmanZ(values), inputs };
}

function priorEnd(book: FactBook, end: string): string | null {
  const target = addDays(end, -365);
  let best: string | null = null;
  for (const f of book.get("Assets") ?? []) {
    if (f.start || f.end >= end) continue;
    if (Math.abs(daysBetween(f.end, target)) > 20) continue;
    if (!best || Math.abs(daysBetween(f.end, target)) < Math.abs(daysBetween(best, target))) best = f.end;
  }
  return best;
}
