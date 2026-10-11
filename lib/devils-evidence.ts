import type {
  CasePeriod,
  CaseEvent,
  CaseTheme,
  CoverageItem,
  Exhibit,
  GlossaryTerm,
  PatternResult,
  Report,
} from "@/types";
import { CAPEX, CASH, DEPRECIATION, INTEREST, OPERATING_CASH, OPERATING_INCOME, REVENUE, money } from "./capital";
import { daysBetween } from "./dates";
import type { PatternContext } from "./devils-advocate-patterns";
import { buildForecast } from "./forecast";
import { padCik } from "./edgar";
import { type FactBook, type SeriesPoint, instantSeries, latestInstantDate, quarterlySeries } from "./xbrl";

/**
 * The evidence behind the long Devil's Advocate case, assembled from the data
 * without the model: the reporting period, trend tables by quarter, the debt,
 * the map, changes, insider trades, 8-Ks, peers and market data. The same
 * tables are shown beside each section and sent to Gemini as text, so every
 * figure the case uses can be checked against them.
 */

export interface Evidence {
  period: CasePeriod;
  exhibits: Record<CaseTheme, Exhibit[]>;
  events: CaseEvent[];
  coverage: CoverageItem[];
  /** Everything above as text for the prompt. */
  facts: string;
  /** Lookup used to resolve "eight_k", "insiders" and other source refs. */
  sources: Record<string, { label: string; url: string | null }>;
}

const AR = ["AccountsReceivableNetCurrent", "ReceivablesNetCurrent", "AccountsReceivableNet"];
const QUARTERS = 12;
const SHOWN = 8;

/** What each 8-K item code means, from the SEC's Form 8-K instructions. */
const EIGHT_K_ITEMS: Record<string, string> = {
  "1.01": "entered a material agreement",
  "1.02": "ended a material agreement",
  "1.03": "bankruptcy or receivership",
  "1.05": "cybersecurity incident",
  "2.01": "completed an acquisition or sale of assets",
  "2.02": "reported quarterly results",
  "2.03": "took on a new debt obligation",
  "2.04": "an event that speeds up repayment of debt",
  "2.05": "exit or restructuring costs",
  "2.06": "wrote down the value of assets",
  "3.01": "stock exchange listing notice",
  "3.02": "sold shares without registration",
  "3.03": "changed the rights of security holders",
  "4.01": "changed auditor",
  "4.02": "earlier financial statements should no longer be relied on",
  "5.01": "change in control",
  "5.02": "a director or officer left or joined",
  "5.03": "amended its charter or bylaws",
  "5.07": "shareholder vote results",
  "7.01": "investor presentation or announcement",
  "8.01": "other events",
};

export function describeItems(items: string): string {
  const codes = items.split(/[,\s]+/).filter((c) => c && c !== "9.01");
  const words = codes.map((c) => EIGHT_K_ITEMS[c] ?? `item ${c}`);
  return words.length ? `${words.join("; ")} (items ${codes.join(", ")})` : "exhibits only";
}

/** Fiscal quarter of each balance sheet date, from the filing whose own period ends there. */
function quarterLabeler(book: FactBook | null): (end: string) => string | null {
  const byAccession = new Map<string, { end: string; fy?: number; fp?: string; filed: string }>();
  for (const facts of book?.values() ?? []) {
    for (const f of facts) {
      if (f.start) continue;
      const seen = byAccession.get(f.accn);
      if (!seen || f.end > seen.end) byAccession.set(f.accn, { end: f.end, fy: f.fy ?? seen?.fy, fp: f.fp ?? seen?.fp, filed: f.filed });
    }
  }
  const labels = new Map<string, { label: string; filed: string }>();
  for (const a of byAccession.values()) {
    if (!a.fy || !a.fp) continue;
    const label = `${a.fp === "FY" ? "Q4" : a.fp} ${a.fy}`;
    const existing = labels.get(a.end);
    if (!existing || a.filed < existing.filed) labels.set(a.end, { label, filed: a.filed });
  }
  return (end) => labels.get(end)?.label ?? null;
}

function pct(now: number | undefined, before: number | undefined): string {
  if (now === undefined || before === undefined || before <= 0) return "n/m";
  const p = ((now - before) / before) * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
}

/** Millions and billions in words; smaller amounts in full with commas. */
const usd = (x: number) => (Math.abs(x) >= 1e6 ? money(x) : `${x < 0 ? "-" : ""}$${Math.round(Math.abs(x)).toLocaleString("en-US")}`);

const at = (series: SeriesPoint[], end: string) => series.find((p) => p.end === end)?.value;

/** The point a year before, within a few weeks either side. */
function yearBefore(series: SeriesPoint[], end: string): number | undefined {
  const target = new Date(`${end}T00:00:00Z`).getTime() - 365 * 86_400_000;
  const near = series.find((p) => Math.abs(new Date(`${p.end}T00:00:00Z`).getTime() - target) < 20 * 86_400_000);
  return near?.value;
}

function prevOf(series: SeriesPoint[], end: string): number | undefined {
  const i = series.findIndex((p) => p.end === end);
  return i > 0 ? series[i - 1].value : undefined;
}

const SEVERITY_ORDER = ["high", "medium", "low", "none"];

export function buildEvidence(report: Report, ctx: PatternContext, peers: Report[], patterns: PatternResult[]): Evidence {
  const { book, today } = ctx;
  const capital = report.capital ?? null;
  const company = report.graph.company;
  const label = quarterLabeler(book);
  const metric = (key: string) => capital?.metrics.find((m) => m.key === key);
  const xbrlUrl = `https://data.sec.gov/api/xbrl/companyfacts/CIK${padCik(company.cik)}.json`;
  const xbrlSource = { label: "SEC XBRL company facts", url: xbrlUrl };
  const exhibits: Record<CaseTheme, Exhibit[]> = {
    earnings: [],
    liquidity: [],
    debt: [],
    counterparties: [],
    changes: [],
    behavior: [],
    peers: [],
    market: [],
  };
  const coverage: CoverageItem[] = [];

  // ------------------------------------------------------------ period
  const periodic = report.sources
    .filter((s) => s.sourceType === "10-Q" || s.sourceType === "10-K")
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const periodEnd = capital?.asOf ?? (book ? latestInstantDate(book, ["Assets"]) : null);
  const through = periodEnd ?? today;

  // ------------------------------------------------------------ quarterly series
  const revenue = book ? quarterlySeries(book, REVENUE, through, QUARTERS) : [];
  const operating = book ? quarterlySeries(book, OPERATING_INCOME, through, QUARTERS + 4) : [];
  const depreciation = book ? quarterlySeries(book, DEPRECIATION, through, QUARTERS + 4) : [];
  const ebitda = operating
    .map((o) => {
      const d = at(depreciation, o.end);
      return d === undefined ? null : { end: o.end, value: o.value + d };
    })
    .filter((p): p is SeriesPoint => p !== null);
  const ocf = book ? quarterlySeries(book, OPERATING_CASH, through, QUARTERS) : [];
  const capex = book ? quarterlySeries(book, CAPEX, through, QUARTERS) : [];
  const interest = book ? quarterlySeries(book, INTEREST, through, QUARTERS) : [];
  const cash = book ? instantSeries(book, CASH, through, QUARTERS) : [];
  const receivables = book ? instantSeries(book, AR, through, QUARTERS) : [];
  const assets = book ? instantSeries(book, ["AssetsCurrent"], through, QUARTERS) : [];
  const liabilities = book ? instantSeries(book, ["LiabilitiesCurrent"], through, QUARTERS) : [];

  const ends = Array.from(new Set([...revenue, ...cash].map((p) => p.end)))
    .sort()
    .slice(-SHOWN);
  const q = (end: string) => label(end) ?? `Quarter ended ${end}`;
  const fmt = (v: number | undefined) => (v === undefined ? "Not tagged" : usd(v));

  if (revenue.length) {
    exhibits.earnings.push({
      title: "Revenue and earnings by quarter",
      columns: ["Quarter", "Ended", "Revenue", "vs prior quarter", "vs a year earlier", "EBITDA", "EBITDA margin", "Interest expense"],
      rows: ends
        .filter((e) => at(revenue, e) !== undefined)
        .map((e) => {
          const r = at(revenue, e);
          const eb = at(ebitda, e);
          return [
            q(e),
            e,
            fmt(r),
            pct(r, prevOf(revenue, e)),
            pct(r, yearBefore(revenue, e)),
            fmt(eb),
            r && eb !== undefined && r > 0 ? `${((eb / r) * 100).toFixed(1)}%` : "n/m",
            fmt(at(interest, e)),
          ];
        }),
      note: "Three-month figures. EBITDA is operating income plus depreciation and amortization, where both are tagged. A quarter tagged only year to date is the difference of two year-to-date figures.",
      source: xbrlSource,
    });
  }
  const ttm = ["revenue", "ebitda", "ebitda_margin", "fcf"].map(metric).filter((m) => m !== undefined);
  if (ttm.length) {
    exhibits.earnings.push({
      title: "Last twelve months",
      columns: ["Measure", "Value", "How it was built"],
      rows: ttm.map((m) => [m.label, m.display, m.note]),
      source: capital ? { label: `${capital.sourceType} filed ${capital.sourceDate}`, url: capital.sourceUrl } : null,
    });
  }
  if (receivables.length && revenue.length) {
    exhibits.earnings.push({
      title: "Money customers owe against revenue",
      columns: ["Quarter", "Ended", "Receivables", "Receivables vs a year earlier", "Revenue vs a year earlier"],
      rows: ends
        .filter((e) => at(receivables, e) !== undefined)
        .map((e) => [
          q(e),
          e,
          fmt(at(receivables, e)),
          pct(at(receivables, e), yearBefore(receivables, e)),
          pct(at(revenue, e), yearBefore(revenue, e)),
        ]),
      note: "Receivables growing much faster than revenue means sales are being booked but not yet collected in cash.",
      source: xbrlSource,
    });
  }

  if (cash.length || ocf.length) {
    exhibits.liquidity.push({
      title: "Cash and cash flow by quarter",
      columns: ["Quarter", "Ended", "Cash", "Cash vs prior quarter", "Current ratio", "Operating cash flow", "Capital spending", "Free cash flow"],
      rows: ends.map((e) => {
        const a = at(assets, e);
        const l = at(liabilities, e);
        const o = at(ocf, e);
        const c = at(capex, e);
        return [
          q(e),
          e,
          fmt(at(cash, e)),
          pct(at(cash, e), prevOf(cash, e)),
          a !== undefined && l ? `${(a / l).toFixed(2)}x` : "Not tagged",
          fmt(o),
          c === undefined ? "Not tagged" : usd(-c),
          o !== undefined && c !== undefined ? usd(o - c) : "Not tagged",
        ];
      }),
      note: "Current ratio is current assets over current liabilities: above 1.0x means short-term assets cover bills due within a year. Free cash flow is operating cash flow less capital spending.",
      source: xbrlSource,
    });
  }
  // Step 4, forecasting: three cases from the company's own quarters, computed here, never by the model.
  const fcfPoints = ocf
    .map((o) => {
      const c = at(capex, o.end);
      return c === undefined ? null : { end: o.end, value: o.value - c };
    })
    .filter((p): p is SeriesPoint => p !== null);
  const forecast = buildForecast({ fcf: fcfPoints, cash, schedule: capital?.maturitySchedule?.rows ?? null });
  if (forecast) {
    exhibits.liquidity.push({
      title: `Cash over the next ${forecast.quarters} quarters, three cases (no new borrowing or share sales)`,
      columns: ["Case", "How it is built", "Free cash flow per quarter", `Debt principal due in ${forecast.quarters} quarters`, `Cash after ${forecast.quarters} quarters`, "Cash runs out"],
      rows: forecast.cases.map((c) => [
        c.label,
        `The company's ${c.assumption}`,
        usd(c.quarterlyFcf),
        usd(forecast.debtDue),
        usd(c.endingCash),
        c.runsOutAt ? `Quarter ending ${c.runsOutAt}` : `Not within ${forecast.quarters} quarters`,
      ]),
      note: `Starts from cash of ${usd(forecast.start.cash)} at ${forecast.start.end}. Scenarios built from quarters the company has already reported, not predictions.`,
      source: xbrlSource,
    });
  }
  const liq = ["cash", "current_ratio", "liquidity", "revolver_availability"].map(metric).filter((m) => m !== undefined);
  if (liq.length) {
    exhibits.liquidity.push({
      title: "Liquidity at the balance sheet date",
      columns: ["Measure", "Value", "How it was built"],
      rows: liq.map((m) => [m.label, m.display, m.note]),
      source: capital ? { label: `${capital.sourceType} filed ${capital.sourceDate}`, url: capital.sourceUrl } : null,
    });
  }

  // ------------------------------------------------------------ debt
  if (capital) {
    const ratios = ["total_debt", "net_debt", "debt_to_ebitda", "net_debt_to_ebitda", "interest_coverage", "secured_share", "next_maturity"]
      .map(metric)
      .filter((m) => m !== undefined);
    if (ratios.length) {
      exhibits.debt.push({
        title: "Debt and credit ratios",
        columns: ["Measure", "Value", "How it was built"],
        rows: ratios.map((m) => [m.label, m.display, m.note]),
        source: { label: `${capital.sourceType} ${capital.fiscalPeriod ?? capital.sourceDate}, capital structure`, url: capital.sourceUrl },
      });
    }
    if (capital.instruments.length) {
      exhibits.debt.push({
        title: "What the company owes",
        columns: ["Instrument", "Ranking", "Outstanding", "Matures", "Interest rate", "Recent change"],
        rows: capital.instruments.map((i) => [
          i.name,
          i.seniority.replace(/_/g, " "),
          i.outstanding !== null ? money(i.outstanding) : i.commitmentText ? `${i.commitmentText} committed` : "Not disclosed",
          i.maturity ?? "Not disclosed",
          i.coupon ?? "Not disclosed",
          i.recentChange ?? "None disclosed",
        ]),
        note: "Senior secured debt is repaid first from the assets pledged to it; unsecured and subordinated lenders are paid from what is left.",
        source: { label: `${capital.sourceType} filed ${capital.sourceDate}, debt note`, url: capital.sourceUrl },
      });
    }
    const schedule = capital.maturitySchedule;
    if (schedule?.rows.length) {
      exhibits.debt.push({
        title: "When the principal is due",
        columns: ["Period", "Amount due", "Share of total"],
        rows: schedule.rows.map((r) => [r.period, money(r.amount), schedule.total > 0 ? `${((r.amount / schedule.total) * 100).toFixed(1)}%` : "n/m"]),
        note: `Total ${money(schedule.total)}${schedule.asOf ? ` as of ${schedule.asOf}` : ""}.`,
        source: { label: schedule.citation.sourceLabel, url: schedule.citation.sourceUrl },
      });
    }
  }

  // ------------------------------------------------------------ the map
  const entities = report.graph.nodes
    .filter((n) => !n.isCentral && n.change?.kind !== "removed")
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
  if (entities.length) {
    exhibits.counterparties.push({
      title: "Who the company depends on, from the map",
      columns: ["Name", "Relationship", "Severity", "Figure", "Trend", "Source"],
      rows: entities.slice(0, 15).map((n) => [
        n.name,
        n.relationship,
        n.severity,
        n.magnitude?.label ?? "Not disclosed",
        n.trend && n.trend !== "unknown" ? n.trend : "Not stated",
        `${n.sourceType} ${n.fiscalPeriod ?? n.sourceDate}`,
      ]),
      note: `${entities.length} entities on the map; the ${Math.min(entities.length, 15)} most severe are listed. Severity is how much the relationship could hurt the company, as read from the filing sentence.`,
    });
  }

  // ------------------------------------------------------------ changes and the timeline
  const changes = report.changes;
  if (changes) {
    const rows = changes.changes
      .filter((c) => !c.judgment)
      .map((c) => [c.name, c.detail, c.before ?? "None", c.after ?? "None"]);
    if (rows.length) {
      exhibits.changes.push({
        title: `What changed since the filings up to ${changes.baselineAsOf}`,
        columns: ["What", "Change", "Before", "Now"],
        rows: rows.slice(0, 15),
        source: changes.newFilings[0] ? { label: `${changes.newFilings[0].sourceType} filed ${changes.newFilings[0].date}`, url: changes.newFilings[0].url } : null,
      });
    }
  }
  const timeline = report.timeline;
  if (timeline && timeline.quarters.length >= 2) {
    const last = timeline.quarters.length - 1;
    const names = new Map(report.graph.nodes.map((n) => [n.id, n.name]));
    const firstSeen = Object.entries(timeline.presence)
      .filter(([id, flags]) => flags[last] && names.has(id))
      .map(([id, flags]) => ({ id, first: flags.findIndex(Boolean) }))
      .filter((x) => x.first >= Math.max(1, last - 3));
    if (firstSeen.length) {
      exhibits.changes.push({
        title: "Names that first appear in recent filings",
        columns: ["Name", "First named in", "Filed"],
        rows: firstSeen.map((x) => [names.get(x.id) ?? x.id, timeline.quarters[x.first].label, timeline.quarters[x.first].filed]),
        note: `Searched in ${timeline.quarters.length} periodic filings from ${timeline.quarters[0].label} to ${timeline.quarters[last].label}.`,
      });
    }
    const severity = Object.entries(timeline.severityBefore)
      .map(([id, b]) => ({ id, b, now: report.graph.nodes.find((n) => n.id === id)?.severity }))
      .filter((x) => x.now && x.now !== x.b.severity);
    if (severity.length) {
      exhibits.changes.push({
        title: "Severity against the previous quarter's map",
        columns: ["Name", "Before", "Now"],
        rows: severity.map((x) => [names.get(x.id) ?? x.id, `${x.b.severity} (${x.b.quarter})`, x.now as string]),
      });
    }
  }
  const languagePatterns = patterns.filter((p) => p.status === "fired" && ["new_risk_factor", "tone_shift", "estimate_change", "auditor_change"].includes(p.id));
  if (languagePatterns.length) {
    exhibits.changes.push({
      title: "Changes in the filing's own words",
      columns: ["Check", "What was found"],
      rows: languagePatterns.map((p) => [p.name, p.detail]),
      source: p0(languagePatterns),
    });
  }

  // ------------------------------------------------------------ behavior
  const insiders = ctx.insiders;
  if (insiders?.length) {
    exhibits.behavior.push({
      title: "Insider trades on the open market, last 90 days",
      columns: ["Traded", "Who", "Role", "Bought or sold", "Shares", "Price", "Value", "Shares held after"],
      rows: insiders
        .slice()
        .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate))
        .map((t) => [
          t.transactionDate,
          t.ownerName,
          t.ownerTitle || (t.isDirector ? "Director" : t.isOfficer ? "Officer" : "Holder"),
          t.code === "S" ? "Sold" : "Bought",
          t.shares.toLocaleString("en-US"),
          t.price !== null ? `$${t.price.toFixed(2)}` : "Not stated",
          t.price !== null ? usd(t.shares * t.price) : "Not stated",
          t.sharesOwnedAfter.toLocaleString("en-US"),
        ]),
      note: "From Form 4 filings: officers, directors and large holders must report their own trades within two business days.",
      source: { label: `Form 4 filed ${insiders[0].filingDate}`, url: insiders[0].sourceUrl },
    });
  }
  const recent8k = ctx.eightKs.filter((k) => daysBetween(k.filed, today) <= 365);
  if (recent8k.length) {
    exhibits.behavior.push({
      title: "8-K filings in the last 12 months",
      columns: ["Filed", "What the company reported"],
      rows: recent8k.slice(0, 15).map((k) => [k.filed, describeItems(k.items)]),
      note: "An 8-K is filed within four business days of a major event.",
      source: { label: `8-K filed ${recent8k[0].filed}`, url: recent8k[0].url },
    });
  }

  // ------------------------------------------------------------ peers
  const peerKeys = ["total_debt", "ebitda", "debt_to_ebitda", "net_debt_to_ebitda", "interest_coverage", "liquidity", "ebitda_margin", "cash"];
  const others = peers.filter((p) => p.capital && p.graph.company.ticker !== company.ticker);
  if (others.length && capital) {
    const all = [report, ...others];
    exhibits.peers.push({
      title: "Against the peers",
      columns: ["Measure", ...all.map((r) => r.graph.company.ticker)],
      rows: peerKeys
        .map((key) => {
          const values = all.map((r) => r.capital?.metrics.find((m) => m.key === key));
          const labelText = values.find(Boolean)?.label;
          return labelText ? [labelText, ...values.map((m) => m?.display ?? "Not available")] : null;
        })
        .filter((r): r is string[] => r !== null),
      note: `Each company's figures come from its own latest 10-Q or 10-K: ${all.map((r) => `${r.graph.company.ticker} ${r.capital?.sourceType} ${r.capital?.fiscalPeriod ?? r.capital?.sourceDate}`).join(", ")}.`,
    });
  }

  // ------------------------------------------------------------ market
  const m = report.market;
  const price = (v: number) => `$${v.toFixed(2)}`;
  if (m) {
    const position = m.high52w > m.low52w ? `${(((m.price - m.low52w) / (m.high52w - m.low52w)) * 100).toFixed(1)}%` : "n/m";
    exhibits.market.push({
      title: `Stock market data, close of ${m.priceDate}`,
      columns: ["Measure", "Value"],
      rows: [
        ["Last close", price(m.price)],
        ["Change over 90 days", `${(m.return90d * 100).toFixed(1)}%`],
        ...(m.benchmarkReturn90d !== null ? [["S&P 500 (SPY) over 90 days", `${(m.benchmarkReturn90d * 100).toFixed(1)}%`]] : []),
        ["52-week closing range", `${price(m.low52w)} to ${price(m.high52w)}`],
        ["Where the price sits in that range (0% = low, 100% = high)", position],
        ...(m.marketCap !== null ? [["Market value of the shares", money(m.marketCap)]] : []),
      ],
      note: "Shareholders are paid after lenders, so the stock is the first place trouble shows: a falling share price makes raising equity to repay debt harder.",
    });
  }

  // ------------------------------------------------------------ events
  const events: CaseEvent[] = [];
  const seen = new Set<string>();
  const addEvent = (e: CaseEvent) => {
    const key = `${e.date}|${e.kind}|${e.text}`;
    if (!seen.has(key)) {
      seen.add(key);
      events.push(e);
    }
  };
  for (const s of report.sources.filter((x) => x.sourceType !== "News")) {
    addEvent({
      date: s.date,
      quarter: s.fiscalPeriod ?? null,
      kind: s.sourceType === "8-K" ? "8-K" : "filing",
      text: `${s.sourceType}${s.fiscalPeriod ? ` for ${s.fiscalPeriod}` : ""} filed`,
      url: s.url,
    });
  }
  if (ctx.prior) addEvent({ date: ctx.prior.filed, kind: "filing", text: `${ctx.prior.label} filed (compared for new language)`, url: ctx.prior.url });
  if (periodEnd) addEvent({ date: periodEnd, quarter: label(periodEnd), kind: "filing", text: `${label(periodEnd) ?? "Quarter"} ends: the balance sheet date of the latest filing` });
  // Routine 8-Ks (presentations, "other events", exhibits) stay in the 8-K table, not the timeline.
  for (const k of recent8k.filter((x) => x.items.split(/[,\s]+/).some((c) => c && !["7.01", "8.01", "9.01"].includes(c)))) addEvent({ date: k.filed, kind: "8-K", text: `8-K: ${describeItems(k.items)}`, url: k.url });
  for (const t of insiders ?? []) {
    addEvent({
      date: t.transactionDate,
      kind: "insider",
      text: `${t.ownerName} ${t.code === "S" ? "sold" : "bought"} ${t.shares.toLocaleString("en-US")} shares${t.price !== null ? ` at $${t.price.toFixed(2)}` : ""}`,
      url: t.sourceUrl,
    });
  }
  for (const i of capital?.instruments ?? []) {
    if (i.maturity && /^\d{4}-\d{2}-\d{2}$/.test(i.maturity) && i.maturity >= today && daysBetween(today, i.maturity) <= 3 * 365) {
      addEvent({ date: i.maturity, kind: "maturity", text: `${i.name} matures${i.outstandingText ? `: ${i.outstandingText}` : ""}`, url: capital?.sourceUrl });
    }
  }
  if (m) addEvent({ date: m.priceDate, kind: "market", text: `Latest close ${price(m.price)}, ${(m.return90d * 100).toFixed(1)}% over 90 days` });
  events.sort((a, b) => a.date.localeCompare(b.date));
  const shownEvents = events.slice(-40);

  // ------------------------------------------------------------ period and coverage
  const period: CasePeriod = {
    quarter: periodic?.fiscalPeriod ?? capital?.fiscalPeriod ?? (periodEnd ? label(periodEnd) : null),
    periodEnd,
    form: periodic?.sourceType ?? capital?.sourceType ?? null,
    filed: periodic?.date ?? capital?.sourceDate ?? null,
    url: periodic?.url ?? capital?.sourceUrl ?? null,
    daysSinceFiling: periodic ? daysBetween(periodic.date, today) : null,
    writtenOn: today,
    historySpan: ends.length >= 2 ? `${q(ends[0])} to ${q(ends[ends.length - 1])}` : null,
  };

  const fired = patterns.filter((p) => p.status === "fired").length;
  const clear = patterns.filter((p) => p.status === "clear").length;
  coverage.push(
    {
      label: "Latest periodic filing",
      detail: ctx.filings[0] ? `${ctx.filings[0].label}, filed ${ctx.filings[0].filed}` : "Could not be read",
      read: Boolean(ctx.filings[0]),
    },
    {
      label: "Previous filing of the same form",
      detail: ctx.prior ? `${ctx.prior.label}, filed ${ctx.prior.filed}, compared for new risk language` : "Not available, so wording changes were not checked",
      read: Boolean(ctx.prior),
    },
    {
      label: "Quarterly XBRL figures",
      detail: ends.length ? `${ends.length} quarters, ${period.historySpan}` : "Not available for this company",
      read: ends.length > 0,
    },
    { label: "Entity map", detail: `${entities.length} entities from ${report.filingsAnalyzed} filings and ${report.newsAnalyzed} news articles`, read: true },
    {
      label: "Capital structure",
      detail: capital ? `${capital.instruments.length} instruments from the ${capital.sourceType} filed ${capital.sourceDate}` : "Not built for this report",
      read: Boolean(capital),
    },
    {
      label: "Changes since the previous quarter",
      detail: changes ? `Compared with filings up to ${changes.baselineAsOf}` : "Not compared yet; open the Changes tab, then argue again",
      read: Boolean(changes),
    },
    {
      label: "Insider trades (Form 4)",
      detail: insiders === null ? "Could not be read" : `${insiders.length} open-market trades in the last 90 days`,
      read: insiders !== null,
    },
    { label: "8-K filings", detail: `${ctx.eightKs.length} in the last two years, ${recent8k.length} in the last 12 months`, read: true },
    {
      label: "Peers",
      detail: others.length ? others.map((p) => p.graph.company.ticker).join(", ") : "Not compared; add peers on the Peers tab, then argue again",
      read: others.length > 0,
    },
    { label: "Market data", detail: m ? `Close of ${m.priceDate}` : "Not available", read: Boolean(m) },
    {
      label: "Quarter-by-quarter timeline",
      detail: timeline ? `${timeline.quarters.length} filings searched` : "Not built yet; open the Graph tab's timeline, then argue again",
      read: Boolean(timeline),
    },
    { label: "Contradiction patterns", detail: `${patterns.length} checked: ${fired} fired, ${clear} clear, ${patterns.length - fired - clear} not evaluated`, read: true },
  );

  const sources: Evidence["sources"] = {
    filing: ctx.filings[0] ? { label: ctx.filings[0].label, url: ctx.filings[0].url } : { label: "Latest filing", url: period.url },
    xbrl: xbrlSource,
    insiders: insiders?.length ? { label: `Form 4 filings, last 90 days (${insiders.length} trades)`, url: insiders[0].sourceUrl } : { label: "Form 4 filings", url: null },
    eight_k: recent8k[0] ? { label: `8-K filed ${recent8k[0].filed}`, url: recent8k[0].url } : { label: "8-K filings", url: null },
    market: { label: m ? `Market data, close of ${m.priceDate}` : "Market data", url: null },
    peers: { label: others.length ? `Peer reports: ${others.map((p) => p.graph.company.ticker).join(", ")}` : "Peers", url: null },
    changes: {
      label: changes ? `Changes since filings up to ${changes.baselineAsOf}` : "Changes",
      url: changes?.newFilings[0]?.url ?? null,
    },
  };

  const facts = [
    `Reporting period: ${period.quarter ?? "not tagged"}, quarter ended ${periodEnd ?? "not tagged"}, from the ${period.form ?? "filing"} filed ${period.filed ?? "date not known"}${period.daysSinceFiling !== null ? `, ${period.daysSinceFiling} days before today` : ""}. Today is ${today}.`,
    `Trend tables cover ${period.historySpan ?? "no quarters"}.`,
    ...Object.entries(exhibits).flatMap(([theme, list]) =>
      list.map((x) => `Exhibit (${theme}) ${x.title}:\n${x.columns.join(" | ")}\n${x.rows.map((r) => r.join(" | ")).join("\n")}${x.note ? `\nNote: ${x.note}` : ""}`),
    ),
    `Dated events:\n${shownEvents.map((e) => `- ${e.date}${e.quarter ? ` (${e.quarter})` : ""}: ${e.text}`).join("\n") || "- none"}`,
    `What was read:\n${coverage.map((c) => `- ${c.label}: ${c.detail}`).join("\n")}`,
  ].join("\n\n");

  return { period, exhibits, events: shownEvents, coverage, facts, sources };
}

function p0(patterns: PatternResult[]): { label: string; url: string } | null {
  const e = patterns.find((p) => p.evidence[0])?.evidence[0];
  return e ? { label: e.label, url: e.url } : null;
}

/** Terms a reader may not know, explained in everyday words. Only terms the case uses are shown. */
const GLOSSARY: { term: string; re: RegExp; meaning: string }[] = [
  { term: "10-Q and 10-K", re: /\b10-[QK]\b/, meaning: "The quarterly (10-Q) and annual (10-K) reports every US-listed company files with the SEC. The 10-K is audited." },
  { term: "8-K", re: /\b8-K\b/, meaning: "A short filing a company must make within four business days of a major event: a new loan, an executive leaving, a new auditor." },
  { term: "Form 4", re: /\bForm 4\b|\binsider/i, meaning: "The filing in which officers, directors and large shareholders report buying or selling the company's stock." },
  { term: "Fiscal quarter", re: /\bQ[1-4] \d{4}\b|\bquarter/i, meaning: "A three-month reporting period. Q2 2026 is the company's second quarter of its 2026 fiscal year, which may not match the calendar year." },
  { term: "Revenue", re: /\brevenue/i, meaning: "Money the company earned from selling its products or services, before any costs." },
  { term: "EBITDA", re: /\bEBITDA\b/, meaning: "Earnings before interest, taxes, depreciation and amortization: a rough measure of the cash the business generates from operations, before paying lenders." },
  { term: "EBITDA margin", re: /\bmargin/i, meaning: "EBITDA as a share of revenue. A falling margin means each dollar of sales leaves less to pay lenders." },
  { term: "Free cash flow", re: /\bfree cash flow\b/i, meaning: "Cash from operations minus spending on equipment and buildings: what is left to repay debt." },
  { term: "Receivables", re: /\breceivable/i, meaning: "Money customers owe for things already sold. If it grows faster than sales, the company is booking revenue it has not collected." },
  { term: "DSO", re: /\bDSO\b|days sales outstanding/i, meaning: "Days sales outstanding: how many days, on average, customers take to pay." },
  { term: "Liquidity", re: /\bliquidity\b/i, meaning: "Cash on hand plus money the company can borrow right away. It is what keeps a company alive when earnings fall short." },
  { term: "Current ratio", re: /\bcurrent ratio\b/i, meaning: "Short-term assets divided by bills due within a year. Below 1.0x means the bills exceed what can readily be turned into cash." },
  { term: "Revolver", re: /\brevolv/i, meaning: "A revolving credit line: a bank commitment the company can draw, repay and draw again, like a corporate credit card." },
  { term: "Leverage (debt / EBITDA)", re: /\bleverage\b|debt \/ EBITDA|debt-to-EBITDA/i, meaning: "Total debt divided by a year of EBITDA: roughly how many years of earnings it would take to repay the debt. Higher is riskier." },
  { term: "Interest coverage", re: /\bcoverage\b|EBITDA \/ interest/i, meaning: "EBITDA divided by interest expense: how many times over the company can pay its interest bill. Below 1.5x is thin." },
  { term: "Net debt", re: /\bnet debt\b/i, meaning: "Debt minus cash. What the company would still owe if it used all its cash to repay lenders." },
  { term: "Maturity", re: /\bmaturit|\bmatures?\b/i, meaning: "The date a loan or bond must be repaid in full. Large amounts due close together are a refinancing risk." },
  { term: "Refinancing risk", re: /\brefinanc/i, meaning: "The risk that when debt comes due, lenders will not lend again, or only at a much higher rate." },
  { term: "Secured and unsecured debt", re: /\bsecured\b|\bunsecured\b|\bsenior\b/i, meaning: "Secured lenders have a claim on specific assets and are repaid first; unsecured lenders share whatever is left." },
  { term: "Convertible notes", re: /\bconvertible/i, meaning: "Bonds the holder can swap for shares. If the stock stays low they stay debt and must be repaid in cash." },
  { term: "Covenant", re: /\bcovenant/i, meaning: "A promise in a loan agreement, such as keeping leverage below a level. Breaking one lets lenders demand repayment or new terms." },
  { term: "Customer concentration", re: /\bconcentrat/i, meaning: "Depending on a few customers for most revenue. Losing one can cut revenue sharply." },
  { term: "Guarantee or backstop", re: /\bguarant|\bbackstop/i, meaning: "A promise by another party to pay if the company or its customer cannot. Its exact conditions decide whether it protects lenders." },
  { term: "Related party", re: /\brelated[- ]part/i, meaning: "A deal with an insider or an affiliated company, where terms may not be set at arm's length." },
  { term: "Risk factors", re: /\brisk factor/i, meaning: "The section of a filing where the company lists what could hurt it. New entries show what management has started to worry about." },
  { term: "XBRL", re: /\bXBRL\b/, meaning: "The machine-readable tags on the numbers in SEC filings, which let the figures be read directly." },
  { term: "Market capitalization", re: /\bmarket (?:cap|value)/i, meaning: "The total value of a company's shares. It is the cushion beneath lenders: the larger it is, the more value stands ahead of losses to debt." },
];

export function glossaryFor(text: string): GlossaryTerm[] {
  return GLOSSARY.filter((g) => g.re.test(text)).map(({ term, meaning }) => ({ term, meaning }));
}
