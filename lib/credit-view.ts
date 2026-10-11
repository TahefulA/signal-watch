import type { CapitalMetric, Report } from "@/types";
import { compactMoney, parseDisplayMoney } from "./node-visuals";

/**
 * Figures derived on screen from numbers already in the report. Each carries
 * how it was built; none uses an input the report does not contain.
 */
export interface DerivedFigure {
  label: string;
  display: string;
  note: string;
  /** Why a credit analyst looks at it. */
  why: string;
  tone?: "stress" | "watch" | "neutral";
}

export function metric(report: Report, key: CapitalMetric["key"]): CapitalMetric | undefined {
  return report.capital?.metrics.find((m) => m.key === key);
}

/** "$2.62 billion" or "Up to $2.87 billion" -> dollars, with whether it is an upper bound. */
export function moneyOf(display: string | undefined): { value: number; upTo: boolean } | null {
  if (!display) return null;
  const upTo = display.startsWith("Up to ");
  const value = parseDisplayMoney(display.replace(/^Up to /, ""));
  return value === null ? null : { value, upTo };
}

/**
 * Months of liquidity at the trailing free cash flow burn. Only for cash-burning
 * companies; it ignores new financing and committed capital expenditure changes.
 */
export function runway(report: Report): DerivedFigure | null {
  const liquidity = moneyOf(metric(report, "liquidity")?.display);
  const fcf = moneyOf(metric(report, "fcf")?.display);
  if (!liquidity || !fcf || fcf.value >= 0) return null;
  const months = liquidity.value / (-fcf.value / 12);
  return {
    label: "Liquidity runway",
    display: `${liquidity.upTo ? "Up to " : ""}${months.toFixed(0)} months`,
    note: `Cash + revolver ${liquidity.upTo ? "up to " : ""}${compactMoney(liquidity.value)} divided by the trailing free cash flow burn of ${compactMoney(-fcf.value)} a year. Ignores new financing.`,
    why: "How long the company can fund itself before it must raise debt or equity.",
    tone: months < 12 ? "stress" : months < 24 ? "watch" : "neutral",
  };
}

/** Net debt as a share of enterprise value at today's equity price: the equity cushion under the debt. */
export function marketLtv(report: Report): DerivedFigure | null {
  const net = moneyOf(metric(report, "net_debt")?.display);
  const cap = report.market?.marketCap ?? null;
  if (!net || !cap || cap <= 0) return null;
  const ev = net.value + cap;
  if (ev <= 0) return null;
  const ltv = (net.value / ev) * 100;
  return {
    label: "Market loan-to-value",
    display: `${ltv.toFixed(0)}%`,
    note: `Net debt ${compactMoney(net.value)} / (net debt + market cap ${compactMoney(cap)}) = ${compactMoney(ev)} enterprise value, price of ${report.market?.priceDate}.`,
    why: "How far the equity can fall before the debt is impaired. A rising figure is an early warning.",
    tone: ltv > 60 ? "stress" : ltv > 40 ? "watch" : "neutral",
  };
}

/** Principal due through the end of the year after the balance sheet date, from the maturities table. */
export function nearTermMaturities(report: Report): DerivedFigure | null {
  const schedule = report.capital?.maturitySchedule;
  const asOf = report.capital?.asOf;
  if (!schedule || !asOf) return null;
  const through = Number(asOf.slice(0, 4)) + 1;
  const due = schedule.rows.filter((r) => {
    const year = Number(r.period.match(/\b(20\d\d)\b/)?.[1] ?? NaN);
    return Number.isFinite(year) && year <= through;
  });
  const total = due.reduce((s, r) => s + r.amount, 0);
  return {
    label: `Due through ${through}`,
    display: compactMoney(total),
    note: `Scheduled principal in ${due.map((r) => r.period.toLowerCase()).join(", ") || "no rows"} of the filing's maturities table (${compactMoney(schedule.total)} in all).`,
    why: "Refinancing need inside the next twelve to twenty-four months.",
    tone: "neutral",
  };
}

export interface MarketView {
  price: string;
  priceDate: string;
  /** 90-day change, e.g. "-34.1%". */
  change90d: string;
  /** Against the benchmark, in percentage points. */
  relative90d: string | null;
  benchmark: string | null;
  marketCap: string | null;
  range52w: string;
  /** 0 at the 52-week low, 1 at the high. */
  rangePosition: number;
}

export function marketView(report: Report): MarketView | null {
  const m = report.market;
  if (!m) return null;
  const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
  return {
    price: `$${m.price.toFixed(2)}`,
    priceDate: m.priceDate,
    change90d: pct(m.return90d),
    relative90d: m.benchmarkReturn90d === null ? null : `${m.return90d - m.benchmarkReturn90d >= 0 ? "+" : ""}${((m.return90d - m.benchmarkReturn90d) * 100).toFixed(1)} pts`,
    benchmark: m.benchmark,
    marketCap: m.marketCap ? compactMoney(m.marketCap) : null,
    range52w: `$${m.low52w.toFixed(2)} to $${m.high52w.toFixed(2)}`,
    rangePosition: m.high52w > m.low52w ? (m.price - m.low52w) / (m.high52w - m.low52w) : 0.5,
  };
}

/** The periodic filing the report is anchored on. */
export function latestPeriodic(report: Report) {
  return report.sources
    .filter((s) => s.sourceType === "10-Q" || s.sourceType === "10-K")
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}
