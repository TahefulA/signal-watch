import type { SignalEvent } from "@/types";
import { addDays, daysBetween, formatDate } from "../dates";
import type { InsiderTransaction } from "../edgar";
import { type PriceSeries, trailingReturn } from "../market";
import { type ComponentDay, clampScore, decayWeight, formatPercent, formatShares, makeEvent, round1 } from "./shared";

export const INSIDER_DECAY_DAYS = 30;

const TOP_OFFICER = /chief executive|\bceo\b|chief financial|\bcfo\b/i;

function describe(t: InsiderTransaction): string {
  const role = t.ownerTitle ? ` (${t.ownerTitle})` : "";
  const verb = t.code === "S" ? "sold" : "bought";
  const price = t.price !== null ? ` at $${t.price.toFixed(2)}` : "";
  return `${t.ownerName}${role} ${verb} ${formatShares(t.shares)} shares${price} on ${formatDate(t.transactionDate)}, holding ${formatShares(t.sharesOwnedAfter)} afterward.`;
}

function form4Label(t: InsiderTransaction): string {
  return `Form 4, Table I, filed ${formatDate(t.filingDate)}`;
}

/**
 * Insider events dated by Form 4 filing date, the first day the trade was public.
 * Purchases during a drawdown lower the component, since they read as conviction.
 */
export function insiderEvents(ticker: string, transactions: InsiderTransaction[], prices: PriceSeries, windowStart: string): SignalEvent[] {
  const events: SignalEvent[] = [];
  const sales = transactions.filter((t) => t.code === "S").sort((a, b) => a.filingDate.localeCompare(b.filingDate));
  let lastCluster = "";

  for (const sale of sales) {
    if (sale.filingDate < windowStart) continue;
    const from = addDays(sale.filingDate, -6);
    const recent = sales.filter((s) => s.filingDate >= from && s.filingDate <= sale.filingDate);
    const sellers = new Set(recent.map((s) => s.ownerName));
    if (sellers.size >= 3 && (!lastCluster || daysBetween(lastCluster, sale.filingDate) > 7)) {
      lastCluster = sale.filingDate;
      const names = Array.from(sellers);
      events.push(
        makeEvent({
          ticker,
          date: sale.filingDate,
          event_type: "insider",
          category: "insider",
          component: "insider_activity",
          title: `${sellers.size} insiders sold within 7 days`,
          quote: recent
            .filter((s, i) => recent.findIndex((r) => r.ownerName === s.ownerName) === i)
            .slice(0, 4)
            .map(describe)
            .join(" "),
          quote_kind: "reported",
          source_label: `Form 4 filings from ${names.slice(0, 3).join(", ")}${names.length > 3 ? " and others" : ""}`,
          source_url: sale.sourceUrl,
          score_impact: 40,
        }),
      );
    }
  }

  const byOwnerFiling = new Map<string, InsiderTransaction[]>();
  for (const t of sales) {
    const key = `${t.accession}|${t.ownerName}`;
    byOwnerFiling.set(key, [...(byOwnerFiling.get(key) ?? []), t]);
  }
  for (const group of byOwnerFiling.values()) {
    const first = group[0];
    if (first.filingDate < windowStart || !TOP_OFFICER.test(first.ownerTitle)) continue;
    const sold = group.reduce((sum, t) => sum + t.shares, 0);
    const after = Math.min(...group.map((t) => t.sharesOwnedAfter));
    const fraction = sold / (sold + after);
    if (fraction > 0.5) {
      events.push(
        makeEvent({
          ticker,
          date: first.filingDate,
          event_type: "insider",
          category: "insider",
          component: "insider_activity",
          title: `${first.ownerTitle} sold ${Math.round(fraction * 100)}% of direct holdings`,
          quote: describe({ ...first, shares: sold, sharesOwnedAfter: after }),
          quote_kind: "reported",
          source_label: form4Label(first),
          source_url: first.sourceUrl,
          score_impact: 30,
        }),
      );
    }
  }

  for (const buy of transactions.filter((t) => t.code === "P")) {
    if (buy.filingDate < windowStart) continue;
    const drawdown = trailingReturn(prices, buy.transactionDate, 21);
    if (drawdown !== null && drawdown < -0.1) {
      events.push(
        makeEvent({
          ticker,
          date: buy.filingDate,
          event_type: "insider",
          category: "insider",
          component: "insider_activity",
          title: `Insider bought after a ${formatPercent(drawdown)} month`,
          quote: describe(buy),
          quote_kind: "reported",
          source_label: form4Label(buy),
          source_url: buy.sourceUrl,
          score_impact: -20,
        }),
      );
    }
  }

  // Sale volume in the trailing 30 days against the trailing-year monthly average.
  let elevated = false;
  for (const sale of sales) {
    if (sale.filingDate < windowStart) continue;
    const d = sale.filingDate;
    const recentShares = sales.filter((s) => s.filingDate > addDays(d, -30) && s.filingDate <= d).reduce((n, s) => n + s.shares, 0);
    const yearShares = sales.filter((s) => s.filingDate > addDays(d, -365) && s.filingDate <= addDays(d, -30)).reduce((n, s) => n + s.shares, 0);
    const monthlyAverage = yearShares / 11;
    const isElevated = monthlyAverage > 0 && recentShares > 2 * monthlyAverage;
    if (isElevated && !elevated) {
      events.push(
        makeEvent({
          ticker,
          date: d,
          event_type: "insider",
          category: "insider",
          component: "insider_activity",
          title: "Insider selling above its 12-month pace",
          quote: `Insiders sold ${formatShares(recentShares)} shares in the 30 days to ${formatDate(d)}, against a monthly average of ${formatShares(monthlyAverage)} over the prior 11 months. Latest: ${describe(sale)}`,
          quote_kind: "reported",
          source_label: form4Label(sale),
          source_url: sale.sourceUrl,
          score_impact: 10,
        }),
      );
    }
    elevated = isElevated;
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

export function insiderComponent(date: string, events: SignalEvent[]): ComponentDay {
  let total = 0;
  const drivers: string[] = [];
  for (const event of events) {
    const weight = decayWeight(daysBetween(event.date, date), INSIDER_DECAY_DAYS);
    if (weight > 0) {
      total += event.score_impact * weight;
      drivers.push(event.id);
    }
  }
  const value = round1(clampScore(total));
  const note =
    drivers.length === 0
      ? "No notable open-market insider trades in the last 30 days."
      : `${drivers.length} insider signal${drivers.length === 1 ? "" : "s"} in the last 30 days, weighted by age.`;
  return { value, drivers, note };
}
