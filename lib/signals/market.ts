import type { SignalEvent } from "@/types";
import { formatDate } from "../dates";
import { type PriceSeries, barIndexAt, trailingReturn, yahooQuoteUrl } from "../market";
import { type ComponentDay, clampScore, formatPercent, makeEvent, round1 } from "./shared";

/** About seven calendar days. */
const SESSIONS = 5;

export interface MarketInputs {
  ticker: string;
  sectorEtf: string;
  stock: PriceSeries;
  sector: PriceSeries;
  highYield: PriceSeries;
  investmentGrade: PriceSeries;
}

interface MarketState {
  relative: number | null;
  stockReturn: number | null;
  sectorReturn: number | null;
  creditChange: number | null;
  underperforming: boolean;
  creditWeakening: boolean;
  stockUpCreditWeak: boolean;
}

/** HYG/LQD price ratio change: a falling ratio means high yield is lagging investment grade. */
function creditChange(inputs: MarketInputs, date: string): number | null {
  const hy = trailingReturn(inputs.highYield, date, SESSIONS);
  const ig = trailingReturn(inputs.investmentGrade, date, SESSIONS);
  if (hy === null || ig === null) return null;
  return (1 + hy) / (1 + ig) - 1;
}

function marketState(inputs: MarketInputs, date: string): MarketState {
  const stockReturn = trailingReturn(inputs.stock, date, SESSIONS);
  const sectorReturn = trailingReturn(inputs.sector, date, SESSIONS);
  const relative = stockReturn !== null && sectorReturn !== null ? stockReturn - sectorReturn : null;
  const credit = creditChange(inputs, date);
  return {
    relative,
    stockReturn,
    sectorReturn,
    creditChange: credit,
    underperforming: relative !== null && relative < -0.1,
    creditWeakening: credit !== null && credit < -0.01,
    stockUpCreditWeak: stockReturn !== null && credit !== null && stockReturn > 0.05 && credit < -0.005,
  };
}

function isTradingDay(series: PriceSeries, date: string): boolean {
  const i = barIndexAt(series, date);
  return i >= 0 && series[i].date === date;
}

export function marketEvents(inputs: MarketInputs, dates: string[]): SignalEvent[] {
  const events: SignalEvent[] = [];
  let previous: MarketState | null = null;
  const source = yahooQuoteUrl(inputs.ticker);
  for (const date of dates) {
    if (!isTradingDay(inputs.stock, date)) continue;
    const state = marketState(inputs, date);
    const base = {
      ticker: inputs.ticker,
      date,
      event_type: "market" as const,
      category: "market" as const,
      component: "market_divergence" as const,
      quote_kind: "reported" as const,
      source_url: source,
    };
    if (state.underperforming && !previous?.underperforming && state.stockReturn !== null && state.sectorReturn !== null) {
      events.push(
        makeEvent({
          ...base,
          title: `Underperformed ${inputs.sectorEtf} by more than 10 points in a week`,
          quote: `${inputs.ticker} returned ${formatPercent(state.stockReturn)} over the 5 sessions to ${formatDate(date)}, while ${inputs.sectorEtf} returned ${formatPercent(state.sectorReturn)}.`,
          source_label: `Yahoo Finance daily closes, ${inputs.ticker} and ${inputs.sectorEtf}`,
          score_impact: 50,
        }),
      );
    }
    if (state.creditWeakening && !previous?.creditWeakening && state.creditChange !== null) {
      events.push(
        makeEvent({
          ...base,
          title: "High-yield credit lagged investment grade",
          quote: `The HYG/LQD price ratio moved ${formatPercent(state.creditChange)} over the 5 sessions to ${formatDate(date)}, a weakening credit backdrop.`,
          source_label: "Yahoo Finance daily closes, HYG and LQD",
          score_impact: 30,
        }),
      );
    }
    if (state.stockUpCreditWeak && !previous?.stockUpCreditWeak && state.stockReturn !== null && state.creditChange !== null) {
      events.push(
        makeEvent({
          ...base,
          title: "Stock rallied while credit weakened",
          quote: `${inputs.ticker} returned ${formatPercent(state.stockReturn)} over the 5 sessions to ${formatDate(date)} while the HYG/LQD ratio moved ${formatPercent(state.creditChange)}.`,
          source_label: `Yahoo Finance daily closes, ${inputs.ticker}, HYG and LQD`,
          score_impact: 20,
        }),
      );
    }
    previous = state;
  }
  return events;
}

export function marketComponent(date: string, inputs: MarketInputs, events: SignalEvent[]): ComponentDay {
  const state = marketState(inputs, date);
  let total = 0;
  const active: string[] = [];
  const latest = (fragment: string): SignalEvent | undefined =>
    events.filter((e) => e.date <= date && e.title.includes(fragment)).at(-1);

  if (state.underperforming) {
    total += 50;
    const e = latest("Underperformed");
    if (e) active.push(e.id);
  }
  if (state.creditWeakening) {
    total += 30;
    const e = latest("High-yield credit");
    if (e) active.push(e.id);
  }
  if (state.stockUpCreditWeak) {
    total += 20;
    const e = latest("rallied while credit");
    if (e) active.push(e.id);
  }

  const parts: string[] = [];
  if (state.stockReturn !== null && state.sectorReturn !== null) {
    parts.push(`${inputs.ticker} ${formatPercent(state.stockReturn)} vs ${inputs.sectorEtf} ${formatPercent(state.sectorReturn)} over 5 sessions`);
  }
  if (state.creditChange !== null) parts.push(`HYG/LQD ${formatPercent(state.creditChange)}`);
  return {
    value: round1(clampScore(total)),
    drivers: active,
    note: parts.length > 0 ? `${parts.join("; ")}.` : "Not enough price history for this date.",
  };
}
