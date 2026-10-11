import type { Entity, PatternCategory, PatternEvidence, PatternResult, Report } from "@/types";
import { CASH, REVENUE, money } from "./capital";
import {
  type FilingRef,
  type InsiderTransaction,
  fetchFilingText,
  fetchInsiderTransactions,
  filingDocumentUrl,
  getSubmissions,
  splitSentences,
} from "./edgar";
import { type FactBook, type SeriesPoint, fetchFacts, fiscalPeriodOf, instantSeries, latestInstantDate, quarterlySeries } from "./xbrl";
import { daysBetween } from "./dates";

/**
 * Thirty-five contradiction patterns for the Devil's Advocate. Each one checks
 * a trigger against data Signal Watch actually read: XBRL facts from the
 * company's own filings, the filing text, 8-K item codes and Form 4s. A pattern
 * fires only when its numbers or wording are found; when the data a check needs
 * is not disclosed or not read, it says so instead of guessing.
 */

/** Text of one filing, with the label used in citations. */
export interface FilingText {
  form: string;
  filed: string;
  /** "10-Q Q2 2026" or "8-K filed 2026-09-03". */
  label: string;
  url: string;
  text: string;
  sentences: string[];
}

/** An 8-K by its item codes, e.g. "5.02" for officer departures and "4.01" for an auditor change. */
export interface EightKRef {
  filed: string;
  items: string;
  url: string;
  /** Primary document text, fetched only for item 5.02 filings. */
  text?: string;
}

export interface PatternContext {
  report: Report;
  book: FactBook | null;
  /** Latest periodic filing, then the latest 10-K when that is a 10-Q, then recent 8-Ks. */
  filings: FilingText[];
  /** The periodic filing of the same form before the latest, for language comparisons. */
  prior: FilingText | null;
  eightKs: EightKRef[];
  /** Open-market purchases and sales from Form 4s in the last 90 days; null when they could not be read. */
  insiders: InsiderTransaction[] | null;
  today: string;
  /** Documents uploaded for a private company: there is no map, debt note, 8-K or Form 4 to check. */
  privateMode?: boolean;
}

export function filingText(form: string, filed: string, label: string, url: string, text: string): FilingText {
  return { form, filed, label, url, text, sentences: splitSentences(text) };
}

// ---------------------------------------------------------------- helpers

const AR = ["AccountsReceivableNetCurrent", "ReceivablesNetCurrent", "AccountsReceivableNet", "AccountsNotesAndLoansReceivableNetCurrent"];
const AR_GROSS = ["AccountsReceivableGrossCurrent", "AccountsReceivableGross"];
const ALLOWANCE = [
  "AccountsReceivableAllowanceForCreditLossCurrent",
  "AllowanceForDoubtfulAccountsReceivableCurrent",
  "AccountsReceivableAllowanceForCreditLoss",
];
const INVENTORY = ["InventoryNet", "InventoryGross", "InventoryFinishedGoodsNetOfReserves"];
const COGS = [
  "CostOfGoodsAndServicesSold",
  "CostOfRevenue",
  "CostOfGoodsSold",
  "CostOfServices",
  "CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization",
];
const SGA = ["SellingGeneralAndAdministrativeExpense", "GeneralAndAdministrativeExpense"];
const RESTRICTED = [
  "RestrictedCashCurrent",
  "RestrictedCash",
  "RestrictedCashAndCashEquivalentsAtCarryingValue",
  "RestrictedCashAndCashEquivalentsNoncurrent",
  "RestrictedCashNoncurrent",
];
const LEASES = ["OperatingLeaseLiability"];
const LEASES_PARTS = ["OperatingLeaseLiabilityNoncurrent", "OperatingLeaseLiabilityCurrent"];
const PBO = ["DefinedBenefitPlanBenefitObligation"];
const PLAN_ASSETS = ["DefinedBenefitPlanFairValueOfPlanAssets"];

/** "$2.62 billion", "$882,027". */
const usd = (x: number) => (Math.abs(x) >= 1e6 ? money(x) : `${x < 0 ? "-" : ""}$${Math.round(Math.abs(x)).toLocaleString("en-US")}`);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const conceptUrl = (cik: string, concept: string) =>
  `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik.padStart(10, "0")}/us-gaap/${concept}.json`;

/** The first concept with a fact at or before the date, for the evidence link. */
function conceptAt(book: FactBook, concepts: string[], end: string): string | null {
  for (const c of concepts) if ((book.get(c) ?? []).some((f) => f.end === end)) return c;
  return null;
}

function xbrlEvidence(ctx: PatternContext, concepts: string[], end: string): PatternEvidence[] {
  if (!ctx.book) return [];
  const c = conceptAt(ctx.book, concepts, end);
  return c ? [{ label: `XBRL: ${c}, period ending ${end}`, url: conceptUrl(ctx.report.graph.company.cik, c) }] : [];
}

function balanceDate(ctx: PatternContext): string | null {
  return ctx.book ? latestInstantDate(ctx.book, ["Assets"]) : null;
}

/** The point closest to a year before the last one, within three weeks. */
function yearBefore(points: SeriesPoint[], end: string): SeriesPoint | null {
  const target = `${Number(end.slice(0, 4)) - 1}${end.slice(4)}`;
  const near = points.filter((p) => Math.abs(daysBetween(p.end, target)) <= 21);
  return near.sort((a, b) => Math.abs(daysBetween(a.end, target)) - Math.abs(daysBetween(b.end, target)))[0] ?? null;
}

interface Change {
  now: number;
  before: number;
  growth: number;
  end: string;
  beforeEnd: string;
}

/** Balance sheet value now and a year earlier. */
function instantYoy(ctx: PatternContext, concepts: string[]): Change | null {
  const end = balanceDate(ctx);
  if (!ctx.book || !end) return null;
  const series = instantSeries(ctx.book, concepts, end, 12);
  const last = series.at(-1);
  if (!last || last.end !== end) return null;
  const prior = yearBefore(series, end);
  if (!prior || prior.value === 0) return null;
  return { now: last.value, before: prior.value, growth: last.value / prior.value - 1, end, beforeEnd: prior.end };
}

/** Twelve months to the latest quarter and the twelve months before, from eight consecutive quarters. */
function flowYoy(ctx: PatternContext, concepts: string[]): Change | null {
  const end = balanceDate(ctx);
  if (!ctx.book || !end) return null;
  const q = quarterlySeries(ctx.book, concepts, end, 8);
  if (q.length < 8 || q[7].end !== end) return null;
  for (let i = 1; i < 8; i++) {
    const gap = daysBetween(q[i - 1].end, q[i].end);
    if (gap < 80 || gap > 100) return null;
  }
  const now = q.slice(4).reduce((s, p) => s + p.value, 0);
  const before = q.slice(0, 4).reduce((s, p) => s + p.value, 0);
  if (before === 0) return null;
  return { now, before, growth: now / before - 1, end, beforeEnd: q[3].end };
}

/** Sentences in the filings read that match, with the filing they came from. */
function find(ctx: PatternContext, re: RegExp, limit = 3): { sentence: string; filing: FilingText }[] {
  const out: { sentence: string; filing: FilingText }[] = [];
  const seen = new Set<string>();
  for (const filing of ctx.filings) {
    for (const sentence of filing.sentences) {
      if (!re.test(sentence) || seen.has(sentence)) continue;
      seen.add(sentence);
      out.push({ sentence, filing });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

const quoteOf = (hit: { sentence: string; filing: FilingText }): PatternEvidence => ({
  label: hit.filing.label,
  url: hit.filing.url,
  quote: hit.sentence,
});

const percentOfRevenue = (e: Entity): number | null => {
  if (e.magnitude?.kind !== "revenue") return null;
  const m = e.magnitude.label.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) : null;
};

function ttmValue(ctx: PatternContext, concepts: string[]): number | null {
  return flowYoy(ctx, concepts)?.now ?? null;
}

function totalDebt(ctx: PatternContext): number | null {
  const instruments = ctx.report.capital?.instruments ?? [];
  const sum = instruments.reduce((s, i) => s + (i.outstanding ?? 0), 0);
  return sum > 0 ? sum : null;
}

// ---------------------------------------------------------------- patterns

interface Pattern {
  id: string;
  name: string;
  category: PatternCategory;
  check: (ctx: PatternContext) => Omit<PatternResult, "id" | "name" | "category">;
}

const notRead = (detail: string) => ({ status: "not_evaluated" as const, detail, evidence: [] });
const clear = (detail: string, evidence: PatternEvidence[] = []) => ({ status: "clear" as const, detail, evidence });
const fired = (detail: string, evidence: PatternEvidence[]) => ({ status: "fired" as const, detail, evidence });

function growthPair(
  ctx: PatternContext,
  aName: string,
  a: Change | null,
  bName: string,
  b: Change | null,
  threshold: number,
  aConcepts: string[],
  bConcepts: string[],
  tail: string,
) {
  if (!a || !b) return notRead(`${!a ? aName : bName} is not tagged for both this year and last in XBRL.`);
  const evidence = [...xbrlEvidence(ctx, aConcepts, a.end), ...xbrlEvidence(ctx, bConcepts, b.end)];
  const text = `${aName} grew ${pct(a.growth)} (${usd(a.before)} to ${usd(a.now)}) while ${bName.toLowerCase()} grew ${pct(b.growth)} (${usd(b.before)} to ${usd(b.now)}) over the year to ${a.end}.`;
  return a.growth - b.growth > threshold ? fired(`${text} ${tail}`, evidence) : clear(text, evidence);
}

const PATTERNS: Pattern[] = [
  // Financial statement red flags.
  {
    id: "ar_vs_revenue",
    name: "Receivables Growing Faster Than Revenue",
    category: "financial",
    check: (ctx) =>
      growthPair(
        ctx,
        "Receivables",
        instantYoy(ctx, AR),
        "Revenue",
        flowYoy(ctx, REVENUE),
        0.05,
        AR,
        REVENUE,
        "This pattern often precedes a write-down or revenue restatement.",
      ),
  },
  {
    id: "inventory_vs_cogs",
    name: "Inventory Growing Faster Than COGS",
    category: "financial",
    check: (ctx) =>
      growthPair(
        ctx,
        "Inventory",
        instantYoy(ctx, INVENTORY),
        "COGS",
        flowYoy(ctx, COGS),
        0.1,
        INVENTORY,
        COGS,
        "This suggests either production overrun or weak demand.",
      ),
  },
  {
    id: "sga_vs_revenue",
    name: "SG&A Growing Faster Than Revenue",
    category: "financial",
    check: (ctx) =>
      growthPair(ctx, "SG&A", flowYoy(ctx, SGA), "Revenue", flowYoy(ctx, REVENUE), 0, SGA, REVENUE, "Cost discipline is deteriorating."),
  },
  {
    id: "dso",
    name: "DSO Increase",
    category: "financial",
    check: (ctx) => {
      const ar = instantYoy(ctx, AR);
      const rev = flowYoy(ctx, REVENUE);
      if (!ar || !rev || rev.now <= 0 || rev.before <= 0)
        return notRead("Receivables or twelve-month revenue is not tagged for both years.");
      const now = (ar.now / rev.now) * 365;
      const before = (ar.before / rev.before) * 365;
      const text = `DSO moved from ${before.toFixed(0)} to ${now.toFixed(0)} days (receivables over twelve-month revenue, times 365).`;
      const ev = [...xbrlEvidence(ctx, AR, ar.end), ...xbrlEvidence(ctx, REVENUE, rev.end)];
      return now - before > 10 ? fired(`${text} Collections are slowing.`, ev) : clear(text, ev);
    },
  },
  {
    id: "dio",
    name: "DIO Increase",
    category: "financial",
    check: (ctx) => {
      const inv = instantYoy(ctx, INVENTORY);
      const cogs = flowYoy(ctx, COGS);
      if (!inv || !cogs || cogs.now <= 0 || cogs.before <= 0)
        return notRead("Inventory or twelve-month COGS is not tagged for both years.");
      const now = (inv.now / cogs.now) * 365;
      const before = (inv.before / cogs.before) * 365;
      const text = `DIO moved from ${before.toFixed(0)} to ${now.toFixed(0)} days (inventory over twelve-month COGS, times 365).`;
      const ev = [...xbrlEvidence(ctx, INVENTORY, inv.end), ...xbrlEvidence(ctx, COGS, cogs.end)];
      return now - before > 15 ? fired(`${text} Inventory is aging.`, ev) : clear(text, ev);
    },
  },
  {
    id: "absorption",
    name: "Absorption Costing",
    category: "financial",
    check: (ctx) => {
      const end = balanceDate(ctx);
      if (!ctx.book || !end) return notRead("No balance sheet date in XBRL.");
      const inv = instantSeries(ctx.book, INVENTORY, end, 3);
      const rev = quarterlySeries(ctx.book, REVENUE, end, 3);
      if (inv.length < 3 || rev.length < 3 || inv[2].end !== end) return notRead("Three quarters of inventory and revenue are not tagged.");
      const rising = inv[1].value > inv[0].value && inv[2].value > inv[1].value;
      const flat = Math.abs(rev[2].value / rev[0].value - 1) < 0.05;
      const text = `Inventory went ${inv.map((p) => usd(p.value)).join(", then ")} over the last three quarter ends; quarterly revenue went ${rev.map((p) => usd(p.value)).join(", then ")}.`;
      const ev = [...xbrlEvidence(ctx, INVENTORY, end), ...xbrlEvidence(ctx, REVENUE, end)];
      return rising && flat
        ? fired(`${text} Inventory rising while sales are flat is the absorption costing pattern Gatto warns about.`, ev)
        : clear(text, ev);
    },
  },
  {
    id: "channel_stuffing",
    name: "Channel Stuffing",
    category: "financial",
    check: (ctx) => {
      const end = balanceDate(ctx);
      if (!ctx.book || !end) return notRead("No balance sheet date in XBRL.");
      const ar = instantSeries(ctx.book, AR, end, 2);
      const rev = quarterlySeries(ctx.book, REVENUE, end, 2);
      if (ar.length < 2 || rev.length < 2 || ar[1].end !== end || ar[0].value === 0 || rev[0].value === 0)
        return notRead("Two quarters of receivables and revenue are not tagged.");
      const arGrowth = ar[1].value / ar[0].value - 1;
      const revGrowth = rev[1].value / rev[0].value - 1;
      const text = `In the latest quarter receivables rose ${pct(arGrowth)} and quarterly revenue ${pct(revGrowth)}. The filings do not show when in the quarter sales were booked, so this checks the receivables spike only.`;
      const ev = [...xbrlEvidence(ctx, AR, end), ...xbrlEvidence(ctx, REVENUE, end)];
      return arGrowth - revGrowth > 0.15 ? fired(text, ev) : clear(text, ev);
    },
  },
  {
    id: "bad_debt",
    name: "Understated Bad Debt",
    category: "financial",
    check: (ctx) => {
      const allowance = instantYoy(ctx, ALLOWANCE);
      const net = instantYoy(ctx, AR);
      const grossTagged = instantYoy(ctx, AR_GROSS);
      if (!allowance || !(grossTagged ?? net)) return notRead("The allowance for credit losses is not tagged for both years.");
      const grossNow = grossTagged?.now ?? (net ? net.now + allowance.now : 0);
      const grossBefore = grossTagged?.before ?? (net ? net.before + allowance.before : 0);
      if (grossNow <= 0 || grossBefore <= 0) return notRead("Gross receivables could not be computed.");
      const now = allowance.now / grossNow;
      const before = allowance.before / grossBefore;
      const text = `The allowance was ${pct(before)} of gross receivables at ${allowance.beforeEnd} and ${pct(now)} at ${allowance.end}.`;
      const ev = xbrlEvidence(ctx, ALLOWANCE, allowance.end);
      return now < before && grossNow > grossBefore ? fired(`${text} The ratio declined while receivables rose.`, ev) : clear(text, ev);
    },
  },
  {
    id: "restricted_cash",
    name: "Restricted Cash Growth",
    category: "financial",
    check: (ctx) =>
      growthPair(
        ctx,
        "Restricted cash",
        instantYoy(ctx, RESTRICTED),
        "Cash",
        instantYoy(ctx, CASH),
        0,
        RESTRICTED,
        CASH,
        "Less of the cash is actually available.",
      ),
  },
  {
    id: "receivables_sold",
    name: "Receivables Sold or Supplier Finance",
    category: "debt",
    check: (ctx) => {
      const hits = find(
        ctx,
        /\b(factor(?:ing|ed)\b[^.]{0,60}\breceivables?|sells? (?:certain |a portion of )?(?:of )?(?:its |our )?(?:trade )?(?:accounts )?receivables|receivables? (?:purchase|sale|securiti[sz]ation) (?:agreement|facility|program)|supply[- ]chain financ\w*|supplier financ\w* (?:program|arrangement|facilit\w*)|reverse factoring)\b/i,
        3,
      );
      return hits.length
        ? fired(
            "The documents describe selling receivables or a supplier finance program. Both raise cash or stretch payments without being counted as debt, so reported leverage can understate what the company owes; the amounts outstanding and whether lenders count them need checking.",
            hits.map(quoteOf),
          )
        : clear("No receivables sale, factoring or supplier finance program in the documents read.");
    },
  },
  {
    id: "off_balance_sheet",
    name: "Off-Balance-Sheet Liabilities",
    category: "financial",
    check: (ctx) => {
      const end = balanceDate(ctx);
      if (!ctx.book || !end) return notRead("No balance sheet date in XBRL.");
      const one = instantSeries(ctx.book, LEASES, end, 1).at(-1);
      const parts = LEASES_PARTS.map((c) => instantSeries(ctx.book as FactBook, [c], end, 1).at(-1)).filter((p) => p?.end === end);
      const lease = one?.end === end ? one.value : parts.length ? parts.reduce((s, p) => s + (p?.value ?? 0), 0) : null;
      if (!lease) return notRead("No operating lease liability is tagged at the latest balance sheet date.");
      const debt = totalDebt(ctx);
      const ev = xbrlEvidence(ctx, [...LEASES, ...LEASES_PARTS], end);
      if (!debt) return clear(`Operating lease liability is ${usd(lease)}; total debt could not be summed from the debt note.`, ev);
      const text = `Operating lease liability of ${usd(lease)} is not in the ${usd(debt)} of debt from the debt note.`;
      return lease / debt >= 0.05 ? fired(`${text} Reported leverage excludes it.`, ev) : clear(text, ev);
    },
  },

  // Customer and revenue risks.
  {
    id: "concentration_terms",
    name: "Concentration Risk Undisclosed Terms",
    category: "customer",
    check: (ctx) => {
      const big = ctx.report.graph.nodes.filter((n) => !n.isCentral && (percentOfRevenue(n) ?? 0) >= 20);
      if (big.length === 0) return clear("No box states a customer at 20% of revenue or more.");
      const hits = big.flatMap((n) => {
        const name = n.name.split(/\s+/)[0];
        const terms = find(
          ctx,
          new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b[^.]*\\b(term|expir|terminat|renew)`, "i"),
          1,
        );
        return terms.length ? [] : [n];
      });
      if (hits.length === 0)
        return clear(
          `${big.map((n) => n.name).join(", ")} ${big.length === 1 ? "is" : "are"} 20% of revenue or more; the filings state contract terms.`,
        );
      const n = hits[0];
      return fired(
        `${n.name} represents ${n.magnitude?.label ?? "a large share of revenue"}. No sentence in the filings read names its contract term or termination rights.`,
        [{ label: `${n.sourceType} ${n.sourceDate}`, url: n.sourceUrl, quote: n.sourceQuote }],
      );
    },
  },
  {
    id: "anchor_tenant",
    name: "Anchor Tenant Loss Risk",
    category: "customer",
    check: (ctx) => {
      const anchors = ctx.report.graph.nodes.filter((n) => n.relationDetail === "ANCHOR_TENANT_OF");
      const mentions = find(ctx, /\banchor (tenant|customer)s?\b/i, 3);
      if (anchors.length === 0 && mentions.length === 0) return clear("The filings read do not name an anchor tenant.");
      const withTerm = mentions.some((m) => /\b(expir|term of|\d+-year|year term)/i.test(m.sentence));
      if (withTerm) return clear("The filings name an anchor tenant and state its lease term.", mentions.slice(0, 1).map(quoteOf));
      const who = anchors[0];
      const share = who ? percentOfRevenue(who) : null;
      const ev = who
        ? [{ label: `${who.sourceType} ${who.sourceDate}`, url: who.sourceUrl, quote: who.sourceQuote }]
        : mentions.slice(0, 1).map(quoteOf);
      return fired(
        `Anchor tenant ${who?.name ?? "named in the filings"}. Lease expiry not disclosed in the sentences that name it.${share ? ` It is ${share}% of revenue.` : ""}`,
        ev,
      );
    },
  },
  {
    id: "churn_unquantified",
    name: "Customer Churn Mentioned But Not Quantified",
    category: "customer",
    check: (ctx) => {
      const hits = find(ctx, /\bchurn\b/i, 5);
      if (hits.length === 0) return clear("The filings read do not mention churn.");
      if (hits.some((h) => /\d+(\.\d+)?\s*%/.test(h.sentence))) return clear("The filings quantify churn.", hits.slice(0, 1).map(quoteOf));
      return fired("Management references churn but does not quantify it in the filings read.", hits.slice(0, 1).map(quoteOf));
    },
  },
  {
    id: "revenue_per_customer",
    name: "Revenue Per Customer Declining",
    category: "customer",
    check: () => notRead("Customer counts are not a standard XBRL tag, so revenue per customer is not computed."),
  },
  {
    id: "top_customer_rating",
    name: "Top Customer Rating Risk",
    category: "customer",
    check: () => notRead("Signal Watch has no counterparty ratings feed; a customer's rating counts only when a filing states it."),
  },

  // Debt and capital structure.
  {
    id: "covenant_headroom",
    name: "Covenant Headroom Narrowing",
    category: "debt",
    check: (ctx) => {
      const hits = find(ctx, /leverage ratio[^.]*?(\d+(?:\.\d+)?)\s*(?:to|:)\s*1(?:\.0+)?\b/i, 3);
      if (hits.length === 0) return notRead("No maximum leverage ratio covenant is stated in the filings read.");
      const limit = Number(hits[0].sentence.match(/(\d+(?:\.\d+)?)\s*(?:to|:)\s*1(?:\.0+)?\b/i)?.[1]);
      const metric = ctx.report.capital?.metrics.find((m) => m.key === "debt_to_ebitda");
      const actual = metric ? Number(metric.display.replace(/x$/, "")) : NaN;
      if (!Number.isFinite(actual) || !limit)
        return clear(`The leverage covenant is ${limit} to 1; total debt to EBITDA could not be computed to compare.`, [quoteOf(hits[0])]);
      const headroom = 1 - actual / limit;
      const text = `Total debt to EBITDA is ${actual.toFixed(1)}x against a leverage covenant of ${limit} to 1, ${pct(headroom)} headroom. The covenant's own definition of EBITDA may differ from the reported figure.`;
      return headroom < 0.15 ? fired(text, [quoteOf(hits[0])]) : clear(text, [quoteOf(hits[0])]);
    },
  },
  {
    id: "near_term_maturities",
    name: "Near-Term Maturity Concentration",
    category: "debt",
    check: (ctx) => {
      const schedule = ctx.report.capital?.maturitySchedule;
      const asOf = ctx.report.capital?.asOf;
      if (!schedule || !asOf || schedule.total <= 0) return notRead("The debt note has no maturity schedule.");
      const from = schedule.asOf ?? asOf;
      // A year counts when all of it falls within 24 months of the balance sheet date.
      const cutoff = `${Number(from.slice(0, 4)) + 2}${from.slice(4)}`;
      const near = schedule.rows.filter((r) => {
        const y = r.period.match(/^(?:Remainder of )?(20\d\d)$/i)?.[1];
        return y !== undefined && `${y}-12-31` <= cutoff;
      });
      const amount = near.reduce((s, r) => s + r.amount, 0);
      const share = amount / schedule.total;
      const last = near.at(-1)?.period.match(/\b(20\d\d)\b/)?.[1] ?? cutoff.slice(0, 4);
      const ev = [
        { label: schedule.citation.sourceLabel || "Debt note", url: schedule.citation.sourceUrl, quote: schedule.citation.quote },
      ];
      const text = `${pct(share)} of scheduled principal (${usd(amount)} of ${usd(schedule.total)}) matures by ${last}.`;
      return share > 0.4 ? fired(text, ev) : clear(text, ev);
    },
  },
  {
    id: "floating_rate",
    name: "Floating Rate Exposure",
    category: "debt",
    check: (ctx) => {
      const debt = (ctx.report.capital?.instruments ?? []).filter((i) => i.outstanding);
      const total = debt.reduce((s, i) => s + (i.outstanding ?? 0), 0);
      if (total <= 0) return notRead("No outstanding amounts in the debt note.");
      const floating = debt.filter((i) => /SOFR|LIBOR|floating|variable|base rate|prime/i.test(`${i.coupon ?? ""} ${i.name}`));
      const amount = floating.reduce((s, i) => s + (i.outstanding ?? 0), 0);
      const share = amount / total;
      const text =
        amount > 0
          ? `${pct(share)} of outstanding debt carries a floating rate (${usd(amount)} of ${usd(total)}). A 100bp increase costs ${usd(amount * 0.01)} per year.`
          : `No instrument in the debt note names a floating rate (SOFR, prime or a base rate).`;
      const ev = floating
        .flatMap((i) => i.citations.slice(0, 1))
        .map((c) => ({ label: `${c.sourceType} ${c.sourceDate}`, url: c.sourceUrl, quote: c.quote }));
      return share > 0.5 ? fired(text, ev) : clear(text, ev);
    },
  },
  {
    id: "guarantee_scope",
    name: "Guarantee Scope Narrower",
    category: "debt",
    check: (ctx) => {
      const guarantors = ctx.report.graph.nodes.filter(
        (n) => n.relationType === "GUARANTEES" || n.relationDetail === "PROVIDES_CREDIT_SUPPORT_TO",
      );
      const limited = find(
        ctx,
        /\b(guarant\w*|backstop\w*|credit support)\b[^.]{0,120}\b(only (?:to|applies|apply|covers?|upon|triggered|if|when)|are only|is only|solely (?:to|for)|do(?:es)? not (?:extend|cover|apply)|not extend)\b/i,
        3,
      );
      if (guarantors.length === 0 && limited.length === 0) return clear("No guarantee or credit support is named in the filings read.");
      const quoted = guarantors.find((g) => /\b(only|solely|limited to|does not|not extend)\b/i.test(g.sourceQuote));
      if (quoted)
        return fired(`${quoted.name}'s support is limited in scope, in the filing's words.`, [
          { label: `${quoted.sourceType} ${quoted.sourceDate}`, url: quoted.sourceUrl, quote: quoted.sourceQuote },
        ]);
      if (limited.length)
        return fired(
          "A guarantee or credit support in the filings is limited in scope, in the filing's words.",
          limited.slice(0, 2).map(quoteOf),
        );
      return clear(
        `${guarantors.map((g) => g.name).join(", ")} provide${guarantors.length === 1 ? "s" : ""} support; no limiting language was found next to it.`,
      );
    },
  },
  {
    id: "subordination",
    name: "Subordination Surprise",
    category: "debt",
    check: (ctx) => {
      const hits = find(ctx, /structurally subordinated|effectively subordinated/i, 2);
      return hits.length
        ? fired("The filings state that some of the debt is structurally or effectively subordinated.", hits.map(quoteOf))
        : clear("The filings read do not describe structural subordination.");
    },
  },
  {
    id: "pension",
    name: "Pension Underfunded",
    category: "debt",
    check: (ctx) => {
      const end = balanceDate(ctx);
      if (!ctx.book || !end) return notRead("No balance sheet date in XBRL.");
      const pbo = instantSeries(ctx.book, PBO, end, 1).at(-1);
      const assets = instantSeries(ctx.book, PLAN_ASSETS, end, 1).at(-1);
      if (!pbo || !assets) return clear("No defined benefit plan is tagged in XBRL.");
      const gap = pbo.value - assets.value;
      const ev = [...xbrlEvidence(ctx, PBO, pbo.end), ...xbrlEvidence(ctx, PLAN_ASSETS, assets.end)];
      const text = `Benefit obligation ${usd(pbo.value)} against plan assets of ${usd(assets.value)} at ${pbo.end}.`;
      return gap > 0.1 * pbo.value
        ? fired(`${text} Pension underfunded by ${usd(gap)}. This is additional leverage not shown in debt to EBITDA.`, ev)
        : clear(text, ev);
    },
  },

  // Operational and strategic.
  {
    id: "tone_shift",
    name: "Management Tone Shift",
    category: "operational",
    check: (ctx) => {
      const current = ctx.filings[0];
      if (!current || !ctx.prior) return notRead("No earlier filing of the same form to compare language with.");
      const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;
      const POS = /\b(growth|expan\w+|record|strong\w*|accelerat\w+)\b/gi;
      const NEG = /\b(declin\w+|impair\w+|uncertain\w*|substantial doubt|going concern|weak\w*|delay\w*|shortfall\w*)\b/gi;
      const per = (text: string, re: RegExp) => (count(text, re) / Math.max(1, text.split(/\s+/).length)) * 10_000;
      const [posNow, posBefore, negNow, negBefore] = [
        per(current.text, POS),
        per(ctx.prior.text, POS),
        per(current.text, NEG),
        per(ctx.prior.text, NEG),
      ];
      const text = `Per 10,000 words, growth language went from ${posBefore.toFixed(1)} in the ${ctx.prior.label} to ${posNow.toFixed(1)} in the ${current.label}; caution language from ${negBefore.toFixed(1)} to ${negNow.toFixed(1)}.`;
      const ev = [
        { label: ctx.prior.label, url: ctx.prior.url },
        { label: current.label, url: current.url },
      ];
      return negNow > negBefore * 1.25 && posNow < posBefore ? fired(text, ev) : clear(text, ev);
    },
  },
  {
    id: "new_risk_factor",
    name: "Risk Factor Language Change",
    category: "operational",
    check: (ctx) => {
      const current = ctx.filings[0];
      if (!current || !ctx.prior) return notRead("No earlier filing of the same form to compare risk factors with.");
      const before = ctx.prior.text.replace(/\s+/g, " ").toLowerCase();
      const fresh = current.sentences.filter((s) => {
        if (!/\b(could|may|might)\b[^.]*\b(adverse\w*|harm|material\w*)\b/i.test(s) || s.length < 80) return false;
        // A sentence counts as new only when no run of eight of its words appears in the earlier filing.
        const w = s.replace(/\s+/g, " ").toLowerCase().split(" ");
        for (let i = 0; i + 8 <= w.length; i += 4) if (before.includes(w.slice(i, i + 8).join(" "))) return false;
        return true;
      });
      if (fresh.length === 0) return clear(`No risk sentence in the ${current.label} is new against the ${ctx.prior.label}.`);
      return fired(
        `New risk language in the ${current.label} that does not appear in the ${ctx.prior.label}.`,
        fresh.slice(0, 2).map((q) => ({ label: current.label, url: current.url, quote: q })),
      );
    },
  },
  {
    id: "insider_selling",
    name: "Insider Selling Cluster",
    category: "operational",
    check: (ctx) => {
      if (!ctx.insiders) return notRead("Form 4 filings could not be read.");
      const sales = ctx.insiders.filter((t) => t.code === "S" && daysBetween(t.transactionDate, ctx.today) <= 60);
      const sellers = new Set(sales.map((s) => s.ownerName));
      const value = sales.reduce((s, t) => s + (t.price ?? 0) * t.shares, 0);
      const ev = Array.from(new Map(sales.map((s) => [s.accession, s])).values())
        .slice(0, 3)
        .map((s) => ({ label: `Form 4 filed ${s.filingDate}, ${s.ownerName}`, url: s.sourceUrl }));
      // Any 30-day window with three or more distinct sellers.
      const clustered = sales.some(
        (a) =>
          new Set(sales.filter((b) => Math.abs(daysBetween(a.transactionDate, b.transactionDate)) <= 15).map((b) => b.ownerName)).size >= 3,
      );
      if (sales.length === 0) return clear("No open-market insider sales in Form 4s over the last 60 days.");
      const text = `${sellers.size} insider${sellers.size === 1 ? "" : "s"} sold ${usd(value)} in open-market sales over the last 60 days.`;
      return clustered ? fired(`Insider selling accelerated. ${text}`, ev) : clear(text, ev);
    },
  },
  {
    id: "guidance_vs_selling",
    name: "Guidance Raised But Insider Selling",
    category: "operational",
    check: (ctx) => {
      const raised = find(ctx, /\b(rais\w+|increas\w+)\b[^.]{0,40}\b(guidance|outlook)\b/i, 1);
      if (raised.length === 0) return clear("The filings read do not say guidance was raised.");
      if (!ctx.insiders) return notRead("Guidance was raised, but Form 4 filings could not be read.");
      const sales = ctx.insiders.filter((t) => t.code === "S" && daysBetween(t.transactionDate, ctx.today) <= 90);
      const value = sales.reduce((s, t) => s + (t.price ?? 0) * t.shares, 0);
      return sales.length
        ? fired(`Guidance raised. Insiders sold ${usd(value)} in open-market sales in the last 90 days.`, [quoteOf(raised[0])])
        : clear("Guidance was raised and no insider sold in the last 90 days.", [quoteOf(raised[0])]);
    },
  },
  {
    id: "departures",
    name: "Key Employee Departures",
    category: "operational",
    check: (ctx) => {
      const year = ctx.eightKs.filter((k) => /\b5\.02\b/.test(k.items) && daysBetween(k.filed, ctx.today) <= 365);
      const departures = year.filter(
        (k) =>
          k.text &&
          /\b(resign\w*|retire\w*|depart\w*|step(?:ped)? down|terminat\w*|will not stand)\b/i.test(k.text) &&
          /\b(Chief|President|Officer|CFO|CEO|COO)\b/.test(k.text),
      );
      const ev = departures.slice(0, 3).map((k) => ({ label: `8-K item 5.02 filed ${k.filed}`, url: k.url }));
      const text = `${departures.length} 8-K${departures.length === 1 ? "" : "s"} under item 5.02 in the last 12 months report${departures.length === 1 ? "s" : ""} an officer or director leaving.`;
      return departures.length >= 2 ? fired(text, ev) : clear(text, ev);
    },
  },
  {
    id: "related_party",
    name: "Related-Party Transactions Undisclosed",
    category: "operational",
    check: (ctx) => {
      const hits = find(ctx, /\brelated[- ]part(y|ies)\b[^.]*\$\s?\d/i, 2);
      return hits.length
        ? fired(
            "The filings report related-party transactions with dollar amounts; check that their nature is explained.",
            hits.map(quoteOf),
          )
        : clear("No related-party transaction with a dollar amount in the filings read.");
    },
  },
  {
    id: "auditor_change",
    name: "Auditor Change",
    category: "operational",
    check: (ctx) => {
      const changes = ctx.eightKs.filter((k) => /\b4\.01\b/.test(k.items) && daysBetween(k.filed, ctx.today) <= 730);
      return changes.length
        ? fired(
            `The company filed an 8-K under item 4.01 (change in certifying accountant) on ${changes[0].filed}. This pattern often precedes restatements.`,
            changes.map((k) => ({ label: `8-K item 4.01 filed ${k.filed}`, url: k.url })),
          )
        : clear("No 8-K under item 4.01 (change in certifying accountant) in the last two years.");
    },
  },
  {
    id: "estimate_change",
    name: "Change in Accounting Estimate",
    category: "operational",
    check: (ctx) => {
      // Policy wording ("when an asset's useful life is adjusted") is not a change; a change names the old and new lives or says one was made.
      const hits = find(
        ctx,
        /\b(changed|revised|extended|increased|shortened)\b[^.]*\buseful li(fe|ves)\b[^.]*\bfrom \d+\s*(years\s*)?to\s*\d+\s*years|\b(we|the Company) (changed|revised|extended|recorded a change in|made a change in)\b[^.]*\b(useful li(fe|ves)|estimate)/i,
        2,
      );
      return hits.length
        ? fired("The filings disclose a change in accounting estimate.", hits.map(quoteOf))
        : clear("No change in accounting estimate in the filings read.");
    },
  },
  {
    id: "litigation_reserve",
    name: "Litigation Reserve Missing",
    category: "operational",
    check: (ctx) => {
      const hits = find(
        ctx,
        /\b(lawsuit|litigation|class action|complaint)\w*\b[^.]*\b(not (probable|reasonably estimable|estimable)|no (amounts?|accrual|liabilit\w+) (has|have) been (accrued|recorded))/i,
        2,
      );
      return hits.length
        ? fired("The filings disclose litigation with no amount accrued.", hits.map(quoteOf))
        : clear("No litigation without an accrual in the filings read.");
    },
  },

  // Industry and macro.
  {
    id: "sole_supplier",
    name: "Supply Chain Concentration",
    category: "industry",
    check: (ctx) => {
      const node = ctx.report.graph.nodes.find((n) => n.relationDetail === "SOLE_SUPPLIER_OF");
      if (node)
        return fired(`Sole supplier dependency on ${node.name}. Any disruption would halt that supply.`, [
          { label: `${node.sourceType} ${node.sourceDate}`, url: node.sourceUrl, quote: node.sourceQuote },
        ]);
      const hits = find(
        ctx,
        /\b(sole|single)[- ](source|supplier)s?\b[^.]*\b(suppl\w+|vendor|manufactur\w+|component|equipment)\b|\b(suppl\w+|vendor|manufactur\w+|component|equipment)\b[^.]*\b(sole|single)[- ](source|supplier)s?\b/i,
        2,
      );
      return hits.length
        ? fired("The filings disclose a sole or single-source supplier.", hits.map(quoteOf))
        : clear("No sole or single-source supplier in the filings read.");
    },
  },
  {
    id: "regulatory_deadline",
    name: "Regulatory Deadline Approaching",
    category: "industry",
    check: (ctx) => {
      const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
      const re = new RegExp(
        `\\b(regulat\\w+|rule|compliance|comply|effective)\\b[^.]*\\b(${MONTHS})\\s+(\\d{1,2},\\s+)?(20\\d\\d)\\b`,
        "i",
      );
      const upcoming = find(ctx, re, 20).filter((h) => {
        const m = h.sentence.match(new RegExp(`\\b(${MONTHS})\\s+(?:\\d{1,2},\\s+)?(20\\d\\d)\\b`, "i"));
        if (!m) return false;
        const date = new Date(`${m[1]} 1, ${m[2]}`).toISOString().slice(0, 10);
        const days = daysBetween(ctx.today, date);
        return days > 0 && days <= 365 && /\b(regulat\w+|rule|compliance|comply)\b/i.test(h.sentence);
      });
      return upcoming.length
        ? fired("A regulatory compliance date falls within the next 12 months.", upcoming.slice(0, 2).map(quoteOf))
        : clear("No regulatory compliance date in the next 12 months in the filings read.");
    },
  },
  {
    id: "commodity",
    name: "Commodity Price Exposure",
    category: "industry",
    check: (ctx) => {
      const hits = find(
        ctx,
        /\b(power|electricity|energy|natural gas|fuel|steel|aluminum|copper|commodit\w+)\b[^.]*?(\d+(?:\.\d+)?)\s*%\s+of\s+(our\s+)?(total\s+)?(cost of revenue|cost of sales|costs? of goods|operating costs|cost of revenues)/i,
        3,
      );
      const hit = hits.find((h) => Number(h.sentence.match(/(\d+(?:\.\d+)?)\s*%\s+of/i)?.[1]) >= 20);
      if (!hit)
        return hits.length
          ? clear("Input costs named in the filings are below 20% of cost of revenue.", hits.slice(0, 1).map(quoteOf))
          : notRead("No input's share of cost of revenue is stated in the filings read.");
      const share = Number(hit.sentence.match(/(\d+(?:\.\d+)?)\s*%\s+of/i)?.[1]) / 100;
      const cogs = ttmValue(ctx, COGS);
      return fired(
        `An input commodity represents ${(share * 100).toFixed(1)}% of cost of revenue.${cogs ? ` A 20% price increase costs ${usd(cogs * share * 0.2)} per year on twelve-month cost of revenue of ${usd(cogs)}.` : ""}`,
        [quoteOf(hit), ...(cogs ? xbrlEvidence(ctx, COGS, balanceDate(ctx) ?? "") : [])],
      );
    },
  },
  {
    id: "currency",
    name: "Currency Exposure",
    category: "industry",
    check: (ctx) => {
      const hits = find(
        ctx,
        /(\d+(?:\.\d+)?)\s*%\s+of\s+(our\s+)?(total\s+|net\s+|consolidated\s+)*(revenue|sales)s?[^.]*\b(outside (of )?the United States|international|foreign|non-U\.S\.|denominated in currencies other)/i,
        3,
      );
      const hit = hits.find((h) => Number(h.sentence.match(/(\d+(?:\.\d+)?)\s*%/)?.[1]) >= 30);
      if (!hit)
        return hits.length
          ? clear("Foreign revenue named in the filings is below 30%.", hits.slice(0, 1).map(quoteOf))
          : notRead("No share of revenue outside the US is stated in the filings read.");
      const share = Number(hit.sentence.match(/(\d+(?:\.\d+)?)\s*%/)?.[1]) / 100;
      const revenue = ttmValue(ctx, REVENUE);
      return fired(
        `${(share * 100).toFixed(1)}% of revenue is earned outside the US.${revenue ? ` A 5% currency move on twelve-month revenue of ${usd(revenue)} is ${usd(revenue * share * 0.05)}.` : ""}`,
        [quoteOf(hit)],
      );
    },
  },
  {
    id: "sector_concentration",
    name: "Customer Concentration by Sector",
    category: "industry",
    check: () => notRead("Customers' industries are not in the filings data Signal Watch reads."),
  },
];

/** Checks that read data a private company does not publish; in private mode they are not evaluated rather than clear. */
const NEEDS_SEC: Record<string, string> = {
  concentration_terms: "Needs revenue shares by customer from the entity map, which private mode does not build.",
  insider_selling: "Private companies file no Form 4 insider trades.",
  guidance_vs_selling: "Private companies file no Form 4 insider trades.",
  departures: "Private companies file no 8-Ks; officer departures are not reported publicly.",
  auditor_change: "Private companies file no 8-Ks; an auditor change is not reported publicly.",
};

/** Runs every pattern. A pattern that throws counts as not evaluated, never as fired. */
export function runPatterns(ctx: PatternContext): PatternResult[] {
  return PATTERNS.map((p) => {
    if (ctx.privateMode && NEEDS_SEC[p.id]) {
      return { id: p.id, name: p.name, category: p.category, status: "not_evaluated" as const, detail: NEEDS_SEC[p.id], evidence: [] };
    }
    try {
      return { id: p.id, name: p.name, category: p.category, ...p.check(ctx) };
    } catch (error) {
      console.warn(`Pattern ${p.id} failed`, error);
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        status: "not_evaluated" as const,
        detail: "The check could not be run on this company's data.",
        evidence: [],
      };
    }
  });
}

export const PATTERN_COUNT = PATTERNS.length;

const FORM4_LIMIT = 20;

/**
 * Reads what the patterns need: the latest periodic filing and the one before
 * it of the same form, the latest 10-K, recent 8-Ks by item code, Form 4s from
 * the last 90 days and the XBRL facts. Every fetch that fails leaves its
 * patterns not evaluated rather than stopping the run.
 */
export async function loadPatternContext(report: Report, today: string): Promise<PatternContext> {
  const cik = report.graph.company.cik;
  const [submissions, book] = await Promise.all([getSubmissions(cik), fetchFacts(cik).catch(() => null)]);
  const periodicSource = report.sources
    .filter((s) => s.sourceType === "10-Q" || s.sourceType === "10-K")
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const latest =
    submissions.filings.find((f) => f.accession === periodicSource?.id) ??
    submissions.filings.find((f) => f.form === "10-Q" || f.form === "10-K");
  const labelOf = (f: FilingRef) => `${f.form} ${(book && fiscalPeriodOf(book, f.accession)) ?? `filed ${f.filingDate}`}`;
  const read = async (f: FilingRef, label = labelOf(f)): Promise<FilingText | null> => {
    try {
      const docs = await fetchFilingText(f);
      return filingText(f.form, f.filingDate, label, filingDocumentUrl(f), docs.map((d) => d.text).join("\n"));
    } catch {
      return null;
    }
  };

  const filings: FilingText[] = [];
  let prior: FilingText | null = null;
  if (latest) {
    const current = await read(latest);
    if (current) filings.push(current);
    const before = submissions.filings.find((f) => f.form === latest.form && f.filingDate < latest.filingDate);
    if (before) prior = await read(before);
    if (latest.form === "10-Q") {
      const annual = submissions.filings.find((f) => f.form === "10-K" && f.filingDate <= latest.filingDate);
      const text = annual ? await read(annual) : null;
      if (text) filings.push(text);
    }
  }
  for (const source of report.sources.filter((s) => s.sourceType === "8-K")) {
    const ref = submissions.filings.find((f) => f.accession === source.id);
    const text = ref ? await read(ref, `8-K filed ${ref.filingDate}`) : null;
    if (text) filings.push(text);
  }

  const eightKs: EightKRef[] = [];
  for (const f of submissions.filings.filter((x) => x.form === "8-K" && daysBetween(x.filingDate, today) <= 730)) {
    const ref: EightKRef = { filed: f.filingDate, items: f.items, url: filingDocumentUrl(f) };
    if (/\b5\.02\b/.test(f.items) && daysBetween(f.filingDate, today) <= 365) {
      ref.text = (await fetchFilingText(f).catch(() => []))[0]?.text ?? undefined;
    }
    eightKs.push(ref);
  }

  let insiders: InsiderTransaction[] | null = [];
  try {
    for (const f of submissions.filings.filter((x) => x.form === "4" && daysBetween(x.filingDate, today) <= 90).slice(0, FORM4_LIMIT)) {
      insiders.push(...(await fetchInsiderTransactions(f)));
    }
  } catch {
    insiders = null;
  }

  return { report, book, filings, prior, eightKs, insiders, today };
}
