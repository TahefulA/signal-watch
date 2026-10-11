import type {
  CapitalMetric,
  CapitalStructure,
  Citation,
  DebtInstrument,
  DebtKind,
  MaturityRow,
  MaturitySchedule,
  Seniority,
  XbrlValue,
} from "@/types";
import { cite, figuresSupported, pageOf } from "./citations";
import { locateQuote } from "./quotes";
import { type CorpusDoc, renderCorpus } from "./corpus";
import { type Schema, extractFigures, generateJson } from "./gemini";
import { type FactBook, instantAt, latestInstantDate, trailingTwelveMonths } from "./xbrl";

const KINDS: DebtKind[] = ["revolver", "term_loan", "secured_notes", "unsecured_notes", "convertible_notes", "other"];
const SENIORITIES: Seniority[] = ["senior_secured", "senior_unsecured", "subordinated", "other"];
const SENIORITY_ORDER: Seniority[] = ["senior_secured", "senior_unsecured", "subordinated", "other"];

const SYSTEM = `You are a credit analyst reading the debt footnotes of a company's latest SEC filing, plus any current reports filed after it.

List every debt instrument the company has outstanding or available: revolving credit facilities, term loans, secured notes, unsecured notes, convertible notes, bridge facilities and similar. One row per instrument. Do not list totals, subtotals, debt issuance costs, leases or instruments the text says were fully repaid or terminated.

For each instrument:
- name: as the filing names it, for example "7.75% Senior Secured Notes due 2030".
- kind and seniority: as the text describes it. Convertible notes are senior_unsecured unless the text says they are secured.
- outstanding_text: the principal outstanding at the balance sheet date, written exactly as the text writes it. Prefer the principal amount column of a table dated at the balance sheet date, for example "$ 500,000" from a table in thousands; otherwise a sentence such as "$ 3,200.0 million". For instruments issued after the balance sheet date, the amount issued. Null if the text gives no such amount.
- outstanding_scale: "thousands" or "millions" when outstanding_text comes from a table whose heading says amounts are in thousands or millions; "as_written" when the text itself includes the word million or billion.
- commitment_text: for revolvers and delayed-draw facilities, the total commitment, written exactly as the text writes it. Otherwise null.
- maturity: YYYY-MM-DD if the text gives a day, YYYY-MM if it gives a month, otherwise YYYY. Null if not stated.
- coupon: the stated interest rate exactly as written, for example "7.75 %" or "SOFR plus 2.75 %". Null if not stated.
- recent_change: if the text describes an issuance, amendment, repayment, exchange or refinancing of this instrument in the twelve months before the filing date, describe it in at most 20 words, with its date. Otherwise null.
- quotes: one to three sentences or table rows copied exactly from the text that together state the amounts, maturity and coupon. When outstanding_text comes from a table, include that table row, for example "2030 Convertible notes $ 500,000 $ ( 9,054 ) $ 490,946". Each has the bracketed id of its block in doc.

as_of is the balance sheet date of the periodic filing, YYYY-MM-DD.
Only use what the text states. Never compute or estimate a number.`;

const nullableString: Schema = { type: "STRING", nullable: true };

const SCHEMA: Schema = {
  type: "OBJECT",
  properties: {
    as_of: nullableString,
    instruments: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          kind: { type: "STRING", enum: KINDS },
          seniority: { type: "STRING", enum: SENIORITIES },
          outstanding_text: nullableString,
          outstanding_scale: { type: "STRING", enum: ["as_written", "thousands", "millions"], nullable: true },
          commitment_text: nullableString,
          maturity: nullableString,
          coupon: nullableString,
          recent_change: nullableString,
          quotes: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: { quote: { type: "STRING" }, doc: { type: "STRING" } },
              required: ["quote", "doc"],
            },
          },
        },
        required: ["name", "kind", "seniority", "quotes"],
      },
    },
  },
  required: ["instruments"],
};

interface RawInstrument {
  name?: unknown;
  kind?: unknown;
  seniority?: unknown;
  outstanding_text?: unknown;
  outstanding_scale?: unknown;
  commitment_text?: unknown;
  maturity?: unknown;
  coupon?: unknown;
  recent_change?: unknown;
  quotes?: unknown;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "debt";
}

type Scale = "thousands" | "millions";

const SCALE: Record<Scale, number> = { thousands: 1e3, millions: 1e6 };

/**
 * Parses "$ 3,200.0 million" or "$1.5 billion" into dollars. A bare table figure
 * such as "$ 500,000" needs the table's verified scale; without one it is rejected.
 */
export function parseAmount(text: string | null, tableScale: Scale | null = null): number | null {
  if (!text) return null;
  const plain = text.replace(/,/g, "");
  const worded = plain.match(/(\d+(?:\.\d+)?)\s*(thousand|million|billion)\b/i);
  if (worded) {
    const unit = { thousand: 1e3, million: 1e6, billion: 1e9 }[worded[2].toLowerCase() as "thousand" | "million" | "billion"];
    return Number(worded[1]) * unit;
  }
  const bare = plain.match(/(\d+(?:\.\d+)?)/);
  return bare && tableScale ? Number(bare[1]) * SCALE[tableScale] : null;
}

/**
 * A table scale label: "(in thousands)", "(dollars in millions)", "(in USD thousands)".
 * Other currencies are not matched, since their amounts would need converting.
 */
const SCALE_LABEL = /\((?:dollars |amounts )?in (?:USD |US\$ |U\.S\. dollars? )?(thousands|millions)\b/gi;

/** The scale stated in the nearest table heading above a passage, e.g. "(in thousands)". */
function scaleAbove(text: string, quote: string): Scale | null {
  const found = locateQuote(quote, text);
  if (!found) return null;
  const window = text.slice(Math.max(0, found.start - 2500), found.start);
  const matches = Array.from(window.matchAll(SCALE_LABEL));
  const last = matches[matches.length - 1];
  return last ? (last[1].toLowerCase() as Scale) : null;
}

/**
 * The principal maturity schedule, read directly from the note's table, e.g.
 * "Principal maturities ... (in thousands): Remainder of 2026 $ 13,850 / 2027 222,890 / ... Total".
 * Kept only when the rows add up to the stated total.
 */
export function parseMaturitySchedule(doc: CorpusDoc): MaturitySchedule | null {
  const heading = doc.text.match(
    new RegExp(`[^\\n]*(?:maturities|principal payments|scheduled payments|payments based on)[^\\n]{0,200}\\n?\\s*${SCALE_LABEL.source}[^\\n]*`, "i"),
  );
  if (!heading || heading.index === undefined) return null;
  const scale = SCALE[heading[1].toLowerCase() as Scale];
  const after = doc.text.slice(heading.index + heading[0].length, heading.index + heading[0].length + 1500);
  const totalAt = after.search(/\bTotal\b/i);
  if (totalAt < 0) return null;
  const body = after.slice(0, totalAt);
  const rows: MaturityRow[] = [];
  for (const m of body.matchAll(/(Remainder of (?:fiscal )?\d{4}|\b(?:19|20)\d{2}\b|Thereafter)\s*(?:\(\d\)\s*)?\$?\s*([\d,]+(?:\.\d+)?)/gi)) {
    rows.push({ period: m[1].replace(/\s+/g, " "), amount: Number(m[2].replace(/,/g, "")) * scale });
  }
  const totalMatch = after.slice(totalAt).match(/\$?\s*([\d,]+(?:\.\d+)?)/);
  const total = totalMatch ? Number(totalMatch[1].replace(/,/g, "")) * scale : null;
  if (rows.length < 2 || total === null) return null;
  const sum = rows.reduce((acc, r) => acc + r.amount, 0);
  if (Math.abs(sum - total) > scale) return null;
  const table = `${heading[0]}\n${after.slice(0, totalAt + (totalMatch ? (totalMatch.index ?? 0) + totalMatch[0].length : 0))}`.trim();
  return {
    rows,
    total,
    table,
    citation: {
      quote: heading[0].trim(),
      sourceType: doc.sourceType,
      sourceDate: doc.date,
      sourceUrl: doc.url,
      sourceLabel: doc.label,
      page: pageOf(doc.fullText, heading[0].trim()),
    },
  };
}

/** Keeps a model-provided field only when its figures appear in the instrument's verified quotes. */
function supported(text: string | null, quotes: string[]): string | null {
  if (!text) return null;
  return extractFigures(text).length > 0 && figuresSupported(text, quotes) ? text : null;
}

function parseInstrument(raw: RawInstrument, byId: Map<string, CorpusDoc>): DebtInstrument | null {
  const name = str(raw.name);
  if (!name) return null;
  const citations: Citation[] = [];
  const citedDocs: CorpusDoc[] = [];
  for (const q of Array.isArray(raw.quotes) ? raw.quotes.slice(0, 3) : []) {
    if (typeof q !== "object" || q === null) continue;
    const { quote, doc } = q as { quote?: unknown; doc?: unknown };
    const source = byId.get(String(doc ?? "").replace(/[[\]]/g, "").trim());
    const citation = cite(source, str(quote));
    if (source && citation && !citations.some((c) => c.quote === citation.quote)) {
      citations.push(citation);
      citedDocs.push(source);
    }
  }
  if (citations.length === 0) return null;
  const quotes = citations.map((c) => c.quote);

  const outstandingText = supported(str(raw.outstanding_text), quotes);
  // A bare table figure counts only if the quote holding it sits under a table heading with the claimed
  // scale, or if a sentence about the same instrument states the same amount in words.
  let outstandingScale: Scale | null = null;
  if (outstandingText && parseAmount(outstandingText) === null) {
    const i = citations.findIndex((c) => figuresSupported(outstandingText, [c.quote]));
    const local = i >= 0 ? scaleAbove(citedDocs[i].text, citations[i].quote) : null;
    const worded = quotes.map((q) => parseAmount(q)).filter((v): v is number => v !== null);
    const bare = Number(outstandingText.replace(/[^\d.]/g, ""));
    const consistent = (["thousands", "millions"] as const).find((scale) =>
      worded.some((w) => Math.abs(w - bare * SCALE[scale]) <= w * 0.005),
    );
    outstandingScale = local ?? consistent ?? null;
    if (local && consistent && local !== consistent) outstandingScale = null;
  }
  const commitmentText = supported(str(raw.commitment_text), quotes);
  const maturityRaw = str(raw.maturity);
  const maturity = maturityRaw && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(maturityRaw) && quotes.some((q) => q.includes(maturityRaw.slice(0, 4))) ? maturityRaw : null;
  const recentChange = str(raw.recent_change);

  return {
    id: slug(name),
    name,
    kind: KINDS.includes(raw.kind as DebtKind) ? (raw.kind as DebtKind) : "other",
    seniority: SENIORITIES.includes(raw.seniority as Seniority) ? (raw.seniority as Seniority) : "other",
    outstanding: parseAmount(outstandingText, outstandingScale),
    outstandingText,
    commitment: parseAmount(commitmentText),
    commitmentText,
    maturity,
    coupon: supported(str(raw.coupon), quotes),
    recentChange: recentChange && figuresSupported(recentChange, quotes) ? recentChange : null,
    citations,
  };
}

export function money(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)} billion`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)} million`;
  return `${sign}$${abs.toFixed(0)}`;
}

function multiple(value: number): string {
  return `${value.toFixed(1)}x`;
}

export const CASH = ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsAndShortTermInvestments", "Cash"];
const OPERATING_INCOME = ["OperatingIncomeLoss"];
const DEPRECIATION = [
  "DepreciationDepletionAndAmortization",
  "DepreciationAndAmortization",
  "DepreciationAmortizationAndAccretionNet",
  "Depreciation",
];
export const REVENUE = [
  "Revenues",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
  "SalesRevenueNet",
];
const OPERATING_CASH = ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"];
const CAPEX = ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"];

/** The first instrument maturing after a date: days away when the day is known, otherwise the month or year. */
function nextMaturity(instruments: DebtInstrument[], from: string | null): { name: string; maturity: string; display: string } | null {
  if (!from) return null;
  const upcoming = instruments
    .filter((i) => i.maturity !== null && i.maturity > from)
    .sort((a, b) => (a.maturity ?? "").localeCompare(b.maturity ?? ""))[0];
  if (!upcoming?.maturity) return null;
  const display = /^\d{4}-\d{2}-\d{2}$/.test(upcoming.maturity)
    ? `${Math.round((Date.parse(upcoming.maturity) - Date.parse(from)) / 86_400_000)} days`
    : upcoming.maturity;
  return { name: upcoming.name, maturity: upcoming.maturity, display };
}

/** The company's own tagged debt total, from the first combination of concepts it reports at the date. */
function xbrlDebt(book: FactBook, cik: string, date: string): { total: number; concepts: string[]; values: XbrlValue[] } | null {
  const combos = [
    ["DebtInstrumentCarryingAmount"],
    ["DebtCurrent", "LongTermDebtAndCapitalLeaseObligations"],
    ["LongTermDebtCurrent", "LongTermDebtNoncurrent"],
    ["DebtLongtermAndShorttermCombinedAmount"],
    ["LongTermDebt"],
  ];
  for (const combo of combos) {
    const values = combo.map((c) => instantAt(book, cik, [c], date));
    if (values.every((v): v is XbrlValue => v !== null)) {
      const found = values as XbrlValue[];
      return { total: found.reduce((sum, v) => sum + v.value, 0), concepts: combo, values: found };
    }
  }
  return null;
}

const INTEREST = ["InterestExpenseNonoperating", "InterestExpense", "InterestExpenseDebt", "InterestAndDebtExpense"];

/** Ratios built from the instruments and the company's XBRL figures. Any input that is missing shows as not available. */
export function computeMetrics(
  instruments: DebtInstrument[],
  book: FactBook | null,
  cik: string,
  asOf: string | null,
  schedule: MaturitySchedule | null,
): { metrics: CapitalMetric[]; financials: XbrlValue[] } {
  const counted = instruments.filter((i) => i.outstanding !== null);
  const listedTotal = counted.reduce((sum, i) => sum + (i.outstanding ?? 0), 0);
  const secured = counted.filter((i) => i.seniority === "senior_secured").reduce((sum, i) => sum + (i.outstanding ?? 0), 0);

  const date = book ? (asOf && instantAt(book, cik, CASH, asOf) ? asOf : latestInstantDate(book, CASH)) : null;
  const cash = book && date ? instantAt(book, cik, CASH, date) : null;
  const operating = book && date ? trailingTwelveMonths(book, cik, OPERATING_INCOME, date) : null;
  const depreciation = book && date ? trailingTwelveMonths(book, cik, DEPRECIATION, date) : null;
  const interest = book && date ? trailingTwelveMonths(book, cik, INTEREST, date) : null;
  const tagged = book && date ? xbrlDebt(book, cik, date) : null;

  // Total debt must reconcile with something the company reported: its maturities table, or its
  // tagged debt total within 15%. Otherwise the instruments Gemini found may be a fraction of the
  // debt, and leverage built on them would mislead, so it is not shown.
  const scheduleMatches = schedule !== null && Math.abs(schedule.total - listedTotal) <= schedule.total * 0.005;
  const taggedMatches = tagged !== null && listedTotal > 0 && Math.abs(tagged.total - listedTotal) <= tagged.total * 0.15;
  let totalDebt: number | null;
  let debtNote: string;
  if (schedule) {
    // A table smaller than the listed instruments probably leaves something out, so the larger figure wins.
    totalDebt = Math.max(schedule.total, listedTotal);
    debtNote = scheduleMatches
      ? `Matches the filing's maturities table and the ${counted.length} instruments below.`
      : totalDebt === schedule.total
        ? `From the filing's maturities table. The instruments matched to quotes below account for ${money(listedTotal)}.`
        : `Principal of the instruments below. The filing's maturities table totals ${money(schedule.total)}.`;
  } else if (taggedMatches && tagged) {
    totalDebt = listedTotal;
    debtNote = `Principal of the ${counted.length} instruments below, within 15% of the ${money(tagged.total)} carrying amount the company reports in XBRL.`;
  } else if (tagged) {
    totalDebt = tagged.total;
    debtNote = `Carrying amount the company reports in XBRL (${tagged.concepts.join(" + ")}), as of ${date}.${counted.length ? ` The instruments matched to quotes below account for ${money(listedTotal)}.` : ""}`;
  } else {
    totalDebt = null;
    debtNote = counted.length
      ? `Not reconciled: the ${counted.length} instrument${counted.length > 1 ? "s" : ""} matched to quotes total ${money(listedTotal)}, but the filing has no maturities table or standard XBRL debt total to confirm it is complete.`
      : "No outstanding principal was found in the debt note.";
  }
  const reconciles = scheduleMatches || taggedMatches;
  const hasDebt = totalDebt !== null;
  const ebitda = operating && depreciation ? operating.value + depreciation.value : null;
  const ebitdaInputs = [operating, depreciation].filter((v): v is XbrlValue => v !== null);
  const revenue = book && date ? trailingTwelveMonths(book, cik, REVENUE, date) : null;
  const operatingCash = book && date ? trailingTwelveMonths(book, cik, OPERATING_CASH, date) : null;
  const capex = book && date ? trailingTwelveMonths(book, cik, CAPEX, date) : null;
  const currentAssets = book && date ? instantAt(book, cik, ["AssetsCurrent"], date) : null;
  const currentLiabilities = book && date ? instantAt(book, cik, ["LiabilitiesCurrent"], date) : null;
  const financials = [...(tagged?.values ?? []), revenue, cash, operating, depreciation, interest, operatingCash, capex, currentAssets, currentLiabilities].filter(
    (v): v is XbrlValue => v !== null,
  );

  const ratio = (numerator: number | null, label: string): { display: string; note: string } => {
    if (numerator === null || !hasDebt) {
      return {
        display: "Not available",
        note: counted.length ? "Not shown because total debt could not be reconciled with the filing." : "No outstanding principal was found in the debt note.",
      };
    }
    if (ebitda === null) return { display: "Not available", note: "EBITDA could not be built from the company's XBRL data." };
    if (ebitda <= 0) return { display: "n/m", note: "Not meaningful: EBITDA was negative." };
    return { display: multiple(numerator / ebitda), note: label };
  };

  const metrics: CapitalMetric[] = [];
  metrics.push({
    key: "total_debt",
    label: "Total debt",
    display: totalDebt !== null ? money(totalDebt) : counted.length ? "Not reconciled" : "Not available",
    note: debtNote,
    inputs: [],
  });
  metrics.push({
    key: "net_debt",
    label: "Net debt",
    display: totalDebt !== null && cash ? money(totalDebt - cash.value) : "Not available",
    note: cash ? `Less cash of ${money(cash.value)} as of ${date}.` : "Cash was not found in the company's XBRL data.",
    inputs: cash ? [cash] : [],
  });
  const lev = ratio(totalDebt, "Total debt over last-12-month EBITDA.");
  metrics.push({ key: "debt_to_ebitda", label: "Total debt / EBITDA", ...lev, inputs: ebitdaInputs });
  const netLev = ratio(totalDebt !== null && cash ? totalDebt - cash.value : null, "Net debt over last-12-month EBITDA.");
  metrics.push({ key: "net_debt_to_ebitda", label: "Net debt / EBITDA", ...netLev, inputs: cash ? [cash, ...ebitdaInputs] : ebitdaInputs });

  metrics.push({
    key: "ebitda",
    label: "EBITDA, last 12 months",
    display: ebitda === null ? "Not available" : money(ebitda),
    note: ebitda === null ? "Operating income or depreciation was not found in the company's XBRL data." : `Operating income plus D&A, 12 months ended ${date}.`,
    inputs: ebitdaInputs,
  });

  let coverage: { display: string; note: string };
  if (ebitda === null || !interest) {
    coverage = {
      display: "Not available",
      note: interest ? "EBITDA could not be built from the company's XBRL data." : "Interest expense was not found in the company's XBRL data.",
    };
  } else if (ebitda <= 0) {
    coverage = { display: "n/m", note: `Not meaningful: EBITDA was negative. Interest expense was ${money(interest.value)}.` };
  } else {
    coverage = {
      display: multiple(ebitda / interest.value),
      note: `Interest expense of ${money(interest.value)}, excluding capitalized interest.`,
    };
  }
  metrics.push({ key: "interest_coverage", label: "EBITDA / interest", ...coverage, inputs: interest ? [interest, ...ebitdaInputs] : ebitdaInputs });

  metrics.push({
    key: "secured_share",
    label: "Secured / total debt",
    display: listedTotal > 0 && reconciles ? `${Math.round((secured / listedTotal) * 100)}%` : "Not available",
    note: reconciles ? "Senior secured share of principal." : "The instruments matched to quotes do not account for all of the debt.",
    inputs: [],
  });

  metrics.push({
    key: "revenue",
    label: "Revenue, last 12 months",
    display: revenue ? money(revenue.value) : "Not available",
    note: revenue ? `Reported revenue, 12 months ended ${date}.` : "Revenue was not found in the company's XBRL data.",
    inputs: revenue ? [revenue] : [],
  });
  metrics.push({
    key: "ebitda_margin",
    label: "EBITDA margin",
    display: ebitda !== null && revenue && revenue.value > 0 ? `${((ebitda / revenue.value) * 100).toFixed(1)}%` : "Not available",
    note: ebitda !== null && revenue && revenue.value > 0 ? "EBITDA over revenue, last 12 months." : "Needs both EBITDA and revenue.",
    inputs: [...ebitdaInputs, ...(revenue ? [revenue] : [])],
  });
  metrics.push({
    key: "cash",
    label: "Cash and equivalents",
    display: cash ? money(cash.value) : "Not available",
    note: cash ? `As of ${date}. Excludes restricted cash.` : "Cash was not found in the company's XBRL data.",
    inputs: cash ? [cash] : [],
  });
  metrics.push({
    key: "current_ratio",
    label: "Current ratio",
    display: currentAssets && currentLiabilities && currentLiabilities.value > 0 ? multiple(currentAssets.value / currentLiabilities.value) : "Not available",
    note: currentAssets && currentLiabilities ? `Current assets over current liabilities, as of ${date}.` : "Current assets or liabilities were not found in XBRL.",
    inputs: [currentAssets, currentLiabilities].filter((v): v is XbrlValue => v !== null),
  });
  const fcf = operatingCash && capex ? operatingCash.value - capex.value : null;
  metrics.push({
    key: "fcf",
    label: "Free cash flow, last 12 months",
    display: fcf !== null ? money(fcf) : "Not available",
    note: fcf !== null ? `Operating cash flow ${money(operatingCash?.value ?? 0)} less capital expenditure ${money(capex?.value ?? 0)}.` : "Operating cash flow or capital expenditure was not found in XBRL.",
    inputs: [operatingCash, capex].filter((v): v is XbrlValue => v !== null),
  });
  const next = nextMaturity(instruments, date ?? asOf);
  metrics.push({
    key: "next_maturity",
    label: "Next final maturity",
    display: next ? next.display : "Not disclosed",
    note: next
      ? `${next.name}, maturing ${next.maturity}.${schedule && schedule.rows[0] && /remainder|\b20\d\d\b/i.test(schedule.rows[0].period) && schedule.rows[0].amount > 0 ? ` Scheduled principal payments start sooner: ${money(schedule.rows[0].amount)} in ${schedule.rows[0].period.toLowerCase()}.` : ""}`
      : "No instrument with a stated maturity after the balance sheet date.",
    inputs: [],
  });

  const revolvers = instruments.filter((i) => i.kind === "revolver" && i.commitment !== null);
  const undrawn = revolvers.reduce((sum, i) => sum + Math.max(0, (i.commitment ?? 0) - (i.outstanding ?? 0)), 0);
  const assumedUndrawn = revolvers.filter((i) => i.outstanding === null).map((i) => i.name);
  metrics.push({
    key: "liquidity",
    label: "Cash + revolver availability",
    // When no drawn amount is disclosed the commitment is an upper bound, and the display says so.
    display: cash ? `${assumedUndrawn.length ? "Up to " : ""}${money(cash.value + undrawn)}` : "Not available",
    note: cash
      ? `Cash plus ${assumedUndrawn.length ? "up to " : ""}${money(undrawn)} of revolver commitments.` +
        (assumedUndrawn.length ? ` No drawn amount is disclosed for ${assumedUndrawn.join(", ")}, so availability may be lower.` : "")
      : "Cash was not found in the company's XBRL data.",
    inputs: cash ? [cash] : [],
  });

  metrics.push({
    key: "revolver_availability",
    label: "Revolver availability",
    display: revolvers.length ? `${assumedUndrawn.length ? "Up to " : ""}${money(undrawn)}` : "No revolver",
    note: revolvers.length
      ? `Commitments on ${revolvers.map((r) => r.name).join(", ")}.${assumedUndrawn.length ? " No drawn amount is disclosed, so the commitment is an upper bound." : ""}`
      : "No revolving facility in the debt note.",
    inputs: [],
  });
  return { metrics, financials };
}

export function sortInstruments(instruments: DebtInstrument[]): DebtInstrument[] {
  return [...instruments].sort(
    (a, b) =>
      SENIORITY_ORDER.indexOf(a.seniority) - SENIORITY_ORDER.indexOf(b.seniority) ||
      (a.maturity ?? "9999").localeCompare(b.maturity ?? "9999"),
  );
}

export interface CapitalInput {
  companyName: string;
  ticker: string;
  cik: string;
  docs: CorpusDoc[];
  sourceType: "10-K" | "10-Q";
  sourceDate: string;
  sourceUrl: string;
  facts: FactBook | null;
}

/** Reads the debt notes into a capital structure. Every instrument carries at least one verified quote. */
export async function extractCapitalStructure(input: CapitalInput): Promise<CapitalStructure> {
  const prompt = `Company: ${input.companyName} (${input.ticker}).\n\n${renderCorpus(input.docs)}`;
  const value = await generateJson(SYSTEM, prompt, SCHEMA, { thinking: "low" });
  const v = (typeof value === "object" && value !== null ? value : {}) as { as_of?: unknown; instruments?: unknown };
  const byId = new Map(input.docs.map((d) => [d.id, d]));
  const parsed = (Array.isArray(v.instruments) ? v.instruments : [])
    .map((raw) => (typeof raw === "object" && raw !== null ? parseInstrument(raw as RawInstrument, byId) : null))
    .filter((i): i is DebtInstrument => i !== null);

  const instruments: DebtInstrument[] = [];
  for (const i of sortInstruments(parsed)) {
    if (instruments.some((x) => x.id === i.id)) continue;
    instruments.push(i);
  }
  const asOfRaw = str(v.as_of);
  const asOf = asOfRaw && /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw) ? asOfRaw : null;
  const maturitySchedule = input.docs.map(parseMaturitySchedule).find((m): m is MaturitySchedule => m !== null) ?? null;
  const { metrics, financials } = computeMetrics(instruments, input.facts, input.cik, asOf, maturitySchedule);
  return {
    asOf,
    sourceType: input.sourceType,
    sourceDate: input.sourceDate,
    sourceUrl: input.sourceUrl,
    instruments,
    maturitySchedule,
    metrics,
    financials,
  };
}
