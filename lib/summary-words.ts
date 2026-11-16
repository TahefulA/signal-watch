import type { DistressBand, DistressReason, Report } from "@/types";

/**
 * The plain-English wording of a report: the band, the verdict, the model's
 * reasons as sentences and the key facts. Chosen by code from the model's
 * reasons and the filed figures, never written by AI. Shared by the Summary
 * tab and the public share page (/c/TICKER).
 */

export const BANDS: { band: DistressBand; label: string; color: string; text: string }[] = [
  { band: "low", label: "Low", color: "#059669", text: "text-emerald-500" },
  { band: "elevated", label: "Elevated", color: "#f59e0b", text: "text-amber-500" },
  { band: "high", label: "High", color: "#dc2626", text: "text-red-500" },
  { band: "severe", label: "Severe", color: "#991b1b", text: "text-red-400" },
];

export const VERDICT: Record<DistressBand, string> = {
  low: "Nothing in its filings looks like the companies that went bankrupt.",
  elevated: "Some warning signs. Worth keeping an eye on.",
  high: "Several warning signs that past bankruptcies shared.",
  severe: "Looks like companies that filed for bankruptcy within a year.",
};

/** For a shareholder: what the band means for them, without a buy or sell call. */
export const OWNER: Record<DistressBand, string> = {
  low: "Nothing in its filings suggests it can't pay its debts. That says nothing about whether the share price will rise.",
  elevated: "Worth watching. If a company does go bankrupt, shareholders are paid last, after every lender.",
  high: "In a bankruptcy, lenders are paid first and shareholders often get nothing. Read the debate before deciding anything.",
  severe: "Companies that looked like this often filed within a year, and shareholders usually lost most or all of their money. Read the debate before deciding anything.",
};

/** Sentences when a feature pushes the risk up, and when it holds it down. Null where the value's sign must agree first. */
const WORDS: Record<string, { bad: string; good: string; higherIsBetter?: boolean }> = {
  log_assets: { bad: "It's a small company, and small companies fail more often.", good: "It's a large company; large companies rarely fail fast." },
  wc_ta: { bad: "Its bills due this year are large next to the cash and receivables to pay them.", good: "It has plenty of short-term assets to pay this year's bills." },
  re_ta: { bad: "Over its life it has lost more money than it has kept.", good: "Over the years it has kept more profit than it lost.", higherIsBetter: true },
  ebit_ta: { bad: "Its core business earns little or loses money.", good: "Its core business is profitable.", higherIsBetter: true },
  eq_tl: { bad: "Its debts are large next to what the shareholders own.", good: "The shareholders' stake is large next to its debts." },
  tl_ta: { bad: "It owes a lot compared with everything it owns.", good: "It doesn't owe much compared with what it owns." },
  cash_ta: { bad: "It holds little cash for its size.", good: "It holds a lot of cash for its size." },
  ni_ta: { bad: "It is losing money.", good: "It makes a profit.", higherIsBetter: true },
  ocf_tl: { bad: "The cash its business brings in is small next to its debts.", good: "Its business brings in solid cash next to its debts." },
  int_cov: { bad: "Its profits barely cover its interest payments, if at all.", good: "Its profits cover its interest payments comfortably." },
  rev_growth: { bad: "Sales fell over the last year.", good: "Sales grew over the last year.", higherIsBetter: true },
  cash_change: { bad: "Its cash pile shrank over the last year.", good: "Its cash pile grew over the last year.", higherIsBetter: true },
  filing_lag: { bad: "It filed its reports late, which often comes before trouble.", good: "It files its reports on time." },
};

/** The plain sentence, or the model's own label when the value's sign disagrees with the plain sentence. */
export function sentence(r: DistressReason, up: boolean): string {
  const w = WORDS[r.feature];
  if (!w) return `${r.label} (${r.display}).`;
  if (w.higherIsBetter && r.value !== null && (up ? r.value > 0 : r.value < 0)) return `${r.label}: ${r.display}. The model counts this ${up ? "against it" : "in its favour"}.`;
  return up ? w.bad : w.good;
}

export const pctText = (p: number) => `${(p * 100).toFixed(p < 0.01 ? 2 : 1)}%`;

/** "1 in 40": never better than 1 in 2. */
export const oneIn = (p: number) => `1 in ${Math.max(2, Math.round(1 / p)).toLocaleString("en-US")}`;

export function bandOf(band: DistressBand) {
  return BANDS.find((b) => b.band === band) ?? BANDS[0];
}

/** "1220 days" read as "in about 3.3 years"; anything else is shown as filed. */
function inTime(display: string): string {
  const days = display.match(/^(\d+) days?$/)?.[1];
  if (!days) return `: ${display}`;
  const n = Number(days);
  return n < 60 ? `in ${n} days` : n < 730 ? `in about ${Math.round(n / 30.4)} months` : `in about ${(n / 365).toFixed(1)} years`;
}

/** The short list under the verdict: the stock, the next debt due, cash on hand and loan-document risk. */
export function summaryFacts(report: Report): { bad: boolean; text: string }[] {
  const metric = (k: string) => report.capital?.metrics.find((m) => m.key === k)?.display ?? null;
  const nextDue = metric("next_maturity");
  const cash = metric("liquidity");
  const doors = report.lme?.verdicts.filter((v) => v.risk === "high").length ?? null;
  const facts: { bad: boolean; text: string }[] = [];
  const m = report.market;
  if (m) {
    const move = (r: number) => `${r >= 0 ? "up" : "down"} ${Math.abs(r * 100).toFixed(0)}%`;
    facts.push({
      bad: m.return90d < -0.2,
      text: `The stock is $${m.price.toFixed(2)} (${m.priceDate}), ${move(m.return90d)} over 90 days${m.benchmarkReturn90d !== null ? ` while the S&P 500 is ${move(m.benchmarkReturn90d)}` : ""}.`,
    });
  }
  if (nextDue && nextDue !== "Not disclosed") facts.push({ bad: false, text: `Its next loan or bond comes due ${inTime(nextDue)}.` });
  if (cash && cash !== "Not available") facts.push({ bad: false, text: `Cash it can reach now: ${cash}.` });
  if (doors !== null) facts.push(doors ? { bad: true, text: `Its loan papers leave ${doors} door${doors === 1 ? "" : "s"} open to moves that can hurt lenders.` } : { bad: false, text: "Its loan papers close the usual doors to moves that hurt lenders." });

  return facts;
}

/** SEC names carry the state of incorporation ("Alight, Inc. / Delaware", "ACME CORP /DE/"); people don't say it. */
export function displayName(name: string): string {
  return name.replace(/\s*\/\s*[A-Za-z .]*\/?\s*$/, "").trim() || name;
}
